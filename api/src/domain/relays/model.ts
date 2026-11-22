import * as Schema from "effect/Schema";
import { UsernameInput } from "../social/model.ts";
import { RELAY_MESSAGE_MAX_LENGTH, RELAY_STATUS } from "./relay-constants.ts";

export const RELAY_POLICY = ["connections", "anyone", "none"] as const;
export const RelayPolicy = Schema.Literals(RELAY_POLICY);
export type RelayPolicy = typeof RelayPolicy.Type;
export * from "./relay-constants.ts";

export const RelayStatus = Schema.Literals(RELAY_STATUS);
export type RelayStatus = typeof RelayStatus.Type;

export const RelayText = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, RELAY_MESSAGE_MAX_LENGTH),
);

export const RelayRecipient = Schema.String.check(Schema.isBetweenLength(1, 100));

export const SendRelayInput = Schema.Struct({ toUsername: UsernameInput, message: RelayText });
export type SendRelayInput = typeof SendRelayInput.Type;

export const RELAY_REFUSAL = ["self", "blocked", "policy_none", "connections_only", "out_of_messages", "unavailable"] as const;
export type RelayRefusal = (typeof RELAY_REFUSAL)[number];

export class RelayNotAllowed extends Schema.TaggedError<RelayNotAllowed>()("RelayNotAllowed", {
  message: Schema.String,
  reason: Schema.Literals(RELAY_REFUSAL),
}) {}

export class RelayLimitReached extends Schema.TaggedError<RelayLimitReached>()("RelayLimitReached", {
  message: Schema.String,
}) {}

export class RelayRecipientUnclear extends Schema.TaggedError<RelayRecipientUnclear>()("RelayRecipientUnclear", {
  message: Schema.String,
  candidates: Schema.Array(Schema.Struct({ username: Schema.String, name: Schema.String })),
}) {}

export class RelayNotFound extends Schema.TaggedError<RelayNotFound>()("RelayNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class RelayClosed extends Schema.TaggedError<RelayClosed>()("RelayClosed", {
  message: Schema.String,
  status: RelayStatus,
}) {}
