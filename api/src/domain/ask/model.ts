import * as Schema from "effect/Schema";
import { Id } from "../core/model.ts";
import { Person } from "../social/model.ts";
import { UserColor } from "../tags/model.ts";
import {
  ASK_DOCUMENT_MAX_LENGTH,
  ASK_DOCUMENT_NAME_MAX_LENGTH,
  ASK_INSTRUCTIONS_MAX_LENGTH,
  ASK_MONTHLY_ANSWER_CAP_MAX,
  ASK_SHARED_CONTEXT_MAX_LENGTH,
} from "./ask-constants.ts";

export * from "./ask-constants.ts";

export const AskSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  instructions: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(ASK_INSTRUCTIONS_MAX_LENGTH))),
  sharedContext: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(ASK_SHARED_CONTEXT_MAX_LENGTH))),
  monthlyAnswerCap: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: ASK_MONTHLY_ANSWER_CAP_MAX })),
  ),
});
export type AskSettingsPatch = typeof AskSettingsPatch.Type;

export class AskDocument extends Schema.Class<AskDocument>("AskDocument")({
  id: Schema.String,
  name: Schema.String,
  text: Schema.String,
  createdAt: Schema.Date,
}) {}

export const AddAskDocumentInput = Schema.Struct({
  name: Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, ASK_DOCUMENT_NAME_MAX_LENGTH)),
  text: Schema.String.check(Schema.isBetweenLength(1, ASK_DOCUMENT_MAX_LENGTH)),
});
export type AddAskDocumentInput = typeof AddAskDocumentInput.Type;

export const AskDocumentRef = Schema.Struct({ id: Id });
export type AskDocumentRef = typeof AskDocumentRef.Type;

export class AskSettings extends Schema.Class<AskSettings>("AskSettings")({
  enabled: Schema.Boolean,
  instructions: Schema.String,
  sharedContext: Schema.String,
  monthlyAnswerCap: Schema.Number,
  poolUsed: Schema.Number,
  resetsAt: Schema.Date,
  documents: Schema.Array(AskDocument),
}) {}

export class AskQuestion extends Schema.Class<AskQuestion>("AskQuestion")({
  id: Schema.String,
  question: Schema.String,
  answer: Schema.String,
  asker: Schema.NullOr(Person),
  createdAt: Schema.Date,
}) {}

export class AskPage extends Schema.Class<AskPage>("AskPage")({
  person: Person,
  color: Schema.NullOr(UserColor),
  available: Schema.Boolean,
  enabled: Schema.Boolean,
  self: Schema.Boolean,
}) {}

export class AskDocumentLimit extends Schema.TaggedError<AskDocumentLimit>()("AskDocumentLimit", {
  message: Schema.String,
}) {}

export class AskDocumentNotFound extends Schema.TaggedError<AskDocumentNotFound>()("AskDocumentNotFound", {
  message: Schema.String,
}) {}
