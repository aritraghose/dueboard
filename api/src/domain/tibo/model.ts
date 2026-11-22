import * as Schema from "effect/Schema";
import { TIBO_EVENING_TIMES, TIBO_MORNING_TIMES } from "./tibo-constants.ts";

export * from "./tibo-constants.ts";
export const TiboMorningTime = Schema.Literals(TIBO_MORNING_TIMES);
export type TiboMorningTime = typeof TiboMorningTime.Type;
export const TiboEveningTime = Schema.Literals(TIBO_EVENING_TIMES);
export type TiboEveningTime = typeof TiboEveningTime.Type;
