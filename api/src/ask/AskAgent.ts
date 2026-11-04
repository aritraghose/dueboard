/// <reference types="@cloudflare/workers-types" />

import { Agent, type Connection } from "agents";
import { generateText } from "ai";
import {
  ASK_ANSWER_MAX_LENGTH,
  ASK_QUESTION_MAX_LENGTH,
  ASK_THREAD_MAX,
  ASK_VISITOR_HOURLY,
  ASK_VISITOR_IDLE_MS,
} from "../domain/ask-constants.ts";
import type { AskPort } from "../domain-client.ts";
import { logMuseUsage, museOptions, museSpark } from "../muse.ts";
import { askMessages, askSystemPrompt } from "./prompt.ts";
import {
  ASK_QUESTION_PATH,
  ASK_THREAD_PATH,
  parseAskInstanceName,
  type AskExchange,
  type AskRefusal,
  type AskRequest,
  type AskResponse,
  type AskThread,
  type AskVisitor,
} from "./protocol.ts";
import { verifyTurnstile } from "./turnstile.ts";

export interface AskEnv {
  readonly AI: Ai;
  readonly AI_GATEWAY_ID: string;
  readonly ASK: AskPort;
  readonly ASK_RATE_LIMIT: RateLimit;
  readonly TURNSTILE_SITE_KEY: string;
  readonly TURNSTILE_SECRET: string;
  readonly TURNSTILE_HOSTNAMES: readonly string[];
}

const MODEL_TIMEOUT_MS = 60_000;

export class AskAgentBase extends Agent<AskEnv> {
  private migrated = false;
  private answering = false;

  private get db() {
    const sql = this.ctx.storage.sql;
    if (!this.migrated) {
      sql.exec(`CREATE TABLE IF NOT EXISTS ask_exchanges (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS ask_attempts (at INTEGER NOT NULL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS ask_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      this.migrated = true;
    }
    return sql;
  }

  private get pair(): { readonly username: string; readonly visitor: AskVisitor } | null {
    return parseAskInstanceName(this.name);
  }

  onConnect(connection: Connection) {
    connection.close(4004, "Not supported");
  }

  validateStateChange() {
    throw new Error("Read-only");
  }

  async onRequest(request: Request): Promise<Response> {
    const pair = this.pair;
    if (!pair) return new Response("Not found", { status: 404 });
    const [, , , , route, ...rest] = new URL(request.url).pathname.split("/");
    if (rest.length > 0) return new Response("Not found", { status: 404 });

    if (route === ASK_THREAD_PATH && request.method === "GET") {
      await this.touch();
      return Response.json({
        exchanges: this.exchanges(),
        needsVerification: !this.verified,
        siteKey: this.env.TURNSTILE_SITE_KEY,
      } satisfies AskThread);
    }
    if (route === ASK_QUESTION_PATH && request.method === "POST") {
      await this.touch();
      const body = (await request.json().catch(() => null)) as Partial<AskRequest> | null;
      const response = await this.ask(pair, body, request.headers.get("cf-connecting-ip"));
      return Response.json(response, { status: response.ok ? 200 : refusalStatus(response.error) });
    }
    return new Response("Not found", { status: 404 });
  }

  private async ask(
    pair: { readonly username: string; readonly visitor: AskVisitor },
    body: Partial<AskRequest> | null,
    ip: string | null,
  ): Promise<AskResponse> {
    const refuse = (error: AskRefusal): AskResponse => ({ ok: false, error, needsVerification: !this.verified });
    const question = typeof body?.question === "string" ? clean(body.question) : "";
    if (question.length === 0 || question.length > ASK_QUESTION_MAX_LENGTH) return refuse("invalid");
    if (this.answering) return refuse("busy");
    this.answering = true;
    try {
      if (!(await this.withinLimits(pair.visitor, ip))) return refuse("limited");
      if (!this.verified) {
        const passed = await verifyTurnstile({
          secret: this.env.TURNSTILE_SECRET,
          token: body?.token,
          remoteIp: ip,
          hostnames: this.env.TURNSTILE_HOSTNAMES,
        });
        if (!passed) return refuse("verify");
        this.setMeta("verified", "1");
      }

      const visitorUserId = pair.visitor.kind === "user" ? pair.visitor.id : null;
      const prepared = await this.env.ASK.prepare(pair.username, visitorUserId).catch((error: unknown) => {
        console.error("Ask prepare failed", error);
        return null;
      });
      if (!prepared) return refuse("unavailable");
      if (!prepared.ok) return refuse(prepared.gate);
      this.countAttempt();

      let answer: string;
      try {
        const started = Date.now();
        const { text, finishReason, usage } = await generateText({
          model: museSpark(this.env, `ask:${pair.username}`, "ask"),
          system: askSystemPrompt(prepared.owner),
          messages: askMessages(this.exchanges(), question),
          providerOptions: museOptions("ask"),
          abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        });
        logMuseUsage("ask", usage, Date.now() - started);
        answer = text.trim().slice(0, ASK_ANSWER_MAX_LENGTH);
        if (answer.length === 0) console.error("Ask answer was empty", finishReason);
      } catch (error) {
        console.error("Ask answer failed", error);
        return refuse("unavailable");
      }
      if (answer.length === 0) return refuse("unavailable");

      const exchange: AskExchange = { id: crypto.randomUUID(), question, answer, createdAt: Date.now() };
      this.db.exec(
        `INSERT INTO ask_exchanges (id, question, answer, created_at) VALUES (?, ?, ?, ?)`,
        exchange.id,
        exchange.question,
        exchange.answer,
        exchange.createdAt,
      );
      this.db.exec(
        `DELETE FROM ask_exchanges WHERE id NOT IN (SELECT id FROM ask_exchanges ORDER BY created_at DESC LIMIT ?)`,
        ASK_THREAD_MAX,
      );
      await this.env.ASK.record(pair.username, visitorUserId, question, answer).catch((error: unknown) =>
        console.error("Ask record failed", error),
      );
      return { ok: true, exchange };
    } finally {
      this.answering = false;
    }
  }

  private async withinLimits(visitor: AskVisitor, ip: string | null) {
    const hourAgo = Date.now() - 60 * 60_000;
    this.db.exec(`DELETE FROM ask_attempts WHERE at < ?`, hourAgo);
    const [{ count } = { count: 0 }] = this.db
      .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM ask_attempts`)
      .toArray();
    if (count >= ASK_VISITOR_HOURLY) return false;
    const keys = [visitor.kind === "user" ? `u:${visitor.id}` : `v:${visitor.id}`];
    if (visitor.kind === "anon") keys.push(`ip:${ip ?? "unknown"}`);
    for (const key of keys) {
      const { success } = await this.env.ASK_RATE_LIMIT.limit({ key });
      if (!success) return false;
    }
    return true;
  }

  private countAttempt() {
    this.db.exec(`INSERT INTO ask_attempts (at) VALUES (?)`, Date.now());
  }

  private exchanges(): AskExchange[] {
    return this.db
      .exec<{ id: string; question: string; answer: string; created_at: number }>(
        `SELECT id, question, answer, created_at FROM ask_exchanges ORDER BY created_at ASC`,
      )
      .toArray()
      .map((row) => ({ id: row.id, question: row.question, answer: row.answer, createdAt: row.created_at }));
  }

  private get verified() {
    return this.meta("verified") === "1";
  }

  private meta(key: string): string | null {
    const [row] = this.db.exec<{ value: string }>(`SELECT value FROM ask_meta WHERE key = ?`, key).toArray();
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string) {
    this.db.exec(
      `INSERT INTO ask_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }

  private async touch() {
    this.setMeta("last_active", String(Date.now()));
    if (this.meta("expiry_armed") !== "1") {
      this.setMeta("expiry_armed", "1");
      await this.schedule(Math.ceil(ASK_VISITOR_IDLE_MS / 1000), "expire");
    }
  }

  async expire() {
    const lastActive = Number(this.meta("last_active") ?? 0);
    const idleFor = Date.now() - lastActive;
    if (idleFor >= ASK_VISITOR_IDLE_MS) {
      await this.destroy();
      return;
    }
    await this.schedule(Math.ceil((ASK_VISITOR_IDLE_MS - idleFor) / 1000) + 1, "expire");
  }
}

const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

const refusalStatus = (error: AskRefusal) =>
  ({ off: 404, unavailable: 503, quota: 429, limited: 429, verify: 403, invalid: 400, busy: 409 })[error];
