import type { LocaleShape } from "../schema";
import type { en } from "./en";
import { zhTW } from "./zh-TW";

export const zhHant: LocaleShape<typeof en> = zhTW;
