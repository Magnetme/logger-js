import logger, { registerLogTransport } from "./logger";
import type { LogMessage, Logger, Scopes, Level } from "./logger";
import consoleTransport from "./consoleTransport";
import kafkaLogger from "./kafkaTransport";
import toString from "./toString";

export {
  consoleTransport,
  kafkaLogger,
  registerLogTransport,
  toString,
  LogMessage,
  Logger,
  Scopes,
  Level,
};
export default logger;
