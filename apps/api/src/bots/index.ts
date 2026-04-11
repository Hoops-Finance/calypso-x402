import type { BotConfig } from "@calypso/shared";
import { arbitrageurTick } from "./arbitrageur.js";
import { noiseTick } from "./noise.js";
import { lpTick } from "./lp.js";
import type { TickFn } from "./chassis.js";

export const BOT_TICKS: Record<BotConfig["archetype"], TickFn> = {
  arbitrageur: arbitrageurTick,
  noise: noiseTick,
  lp_manager: lpTick,
};

export { runBot, type RunBotOptions, type TickContext, type TickFn } from "./chassis.js";
