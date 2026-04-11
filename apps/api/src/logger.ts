import pino from "pino";
import { ENV } from "./env.js";

export const logger = pino({
  level: ENV.LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss" },
  },
});
