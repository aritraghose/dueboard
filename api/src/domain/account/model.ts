import * as Schema from "effect/Schema";
import { Privacy } from "../core/model.ts";
import { RelayPolicy } from "../relays/model.ts";
import { UserColor } from "../tags/model.ts";
import { TiboEveningTime, TiboMorningTime } from "../tibo/model.ts";

export const TIME_ZONE_MAX_LENGTH = 64;
export const DELETE_ACCOUNT_CONFIRM_MAX_LENGTH = 64;

export const SettingsPatch = Schema.Struct({
  defaultPrivacy: Schema.optionalKey(Privacy),
  defaultShareToLive: Schema.optionalKey(Schema.Boolean),
  relayPolicy: Schema.optionalKey(RelayPolicy),
  tiboProactive: Schema.optionalKey(Schema.Boolean),
  tiboMorningPlan: Schema.optionalKey(Schema.Boolean),
  tiboMorningTime: Schema.optionalKey(TiboMorningTime),
  tiboDeadlineNudges: Schema.optionalKey(Schema.Boolean),
  tiboHabitCheck: Schema.optionalKey(Schema.Boolean),
  tiboEveningTime: Schema.optionalKey(TiboEveningTime),
});
export type SettingsPatch = typeof SettingsPatch.Type;

export const TIBO_PROACTIVE_KEYS = [
  "tiboProactive",
  "tiboMorningPlan",
  "tiboMorningTime",
  "tiboDeadlineNudges",
  "tiboHabitCheck",
  "tiboEveningTime",
] as const satisfies readonly (keyof SettingsPatch)[];

export const DeleteAccountInput = Schema.Struct({
  confirmUsername: Schema.String.check(Schema.isMaxLength(DELETE_ACCOUNT_CONFIRM_MAX_LENGTH)),
});
export type DeleteAccountInput = typeof DeleteAccountInput.Type;

export class Settings extends Schema.Class<Settings>("Settings")({
  timeZone: Schema.String,
  color: UserColor,
  defaultPrivacy: Privacy,
  defaultShareToLive: Schema.Boolean,
  relayPolicy: RelayPolicy,
  tiboProactive: Schema.Boolean,
  tiboMorningPlan: Schema.Boolean,
  tiboMorningTime: TiboMorningTime,
  tiboDeadlineNudges: Schema.Boolean,
  tiboHabitCheck: Schema.Boolean,
  tiboEveningTime: TiboEveningTime,
}) {}
