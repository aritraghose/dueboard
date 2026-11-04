// The Ask page's plain constants (architecture.md §7.6). No imports, so the
// AgentWorker and the browser can use them without pulling in Effect.
// Re-exported by `./model.ts`, which adds their Schemas.

/** The owner's instructions for their Ask agent, in characters. */
export const ASK_INSTRUCTIONS_MAX_LENGTH = 4000;
/** What the owner shares for the Ask agent to answer from, in characters. */
export const ASK_SHARED_CONTEXT_MAX_LENGTH = 8000;

/**
 * The Ask pool: answers an owner's page gives logged-out visitors each month
 * (in the owner's time zone). It's separate from the owner's own AI quota,
 * and the owner can lower it (`monthly_answer_cap`, 1 to this). Signed-in
 * visitors pay from their own quota instead and don't touch the pool.
 */
export const ASK_MONTHLY_ANSWER_CAP_DEFAULT = 50;
export const ASK_MONTHLY_ANSWER_CAP_MAX = 50;

/**
 * Files the owner adds for the Ask agent (PDFs, like a CV): the website
 * turns each into text (Workers AI `toMarkdown`), the owner reviews it, and
 * only the text is kept. At most this many per owner.
 */
export const ASK_DOCUMENTS_MAX = 2;
/** The most text one file keeps, in characters (a CV is usually 3–6k). */
export const ASK_DOCUMENT_MAX_LENGTH = 12000;
/** A file's name as shown, in characters. */
export const ASK_DOCUMENT_NAME_MAX_LENGTH = 120;
/** The largest PDF the website converts (Workers AI's limit for PDFs without OCR). */
export const ASK_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

/** The longest question a visitor can ask, in characters. */
export const ASK_QUESTION_MAX_LENGTH = 500;
/** The longest answer kept (the model is asked for far less). */
export const ASK_ANSWER_MAX_LENGTH = 2000;

/** An answer to a signed-in visitor costs them one AI message (2 units, reason `ask_answer`). */
export const ASK_UNITS_PER_ANSWER = 2;

/** How long the owner can read a question in Settings. */
export const ASK_QUESTION_RETENTION_DAYS = 30;
/** Most questions Settings lists at once. */
export const ASK_QUESTIONS_LIST_LIMIT = 100;

/** A visitor's exchange is wiped after this long without a question or a visit. */
export const ASK_VISITOR_IDLE_MS = 60 * 60_000;
/** Questions one visitor may ask one owner in any hour (the burst limit is `LIMITS.ask`). */
export const ASK_VISITOR_HOURLY = 10;
/** Earlier exchanges the model sees with a new question, for follow-ups. */
export const ASK_CONTEXT_EXCHANGES = 6;
/** Exchanges a visitor's thread keeps (older ones drop off). */
export const ASK_THREAD_MAX = 50;
