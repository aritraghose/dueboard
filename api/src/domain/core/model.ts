import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const PRIVACY = ["public", "connections", "private"] as const;
export const Privacy = Schema.Literals(PRIVACY);
export type Privacy = typeof Privacy.Type;

export const Id = Schema.String.check(Schema.isBetweenLength(1, 64));

export const decodeInput =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (input: unknown): Effect.Effect<S["Type"], InvalidInput, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => new InvalidInput({ message: error.message })),
    );

export class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {
  message: Schema.String,
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  message: Schema.String,
  username: Schema.String,
}) {}
