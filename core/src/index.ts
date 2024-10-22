export type Level = "VERBOSE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export type Scopes = { [key: string]: Level };

const levelToValue: { [p in Level]: number } = {
  VERBOSE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
};

export type LogMessage = {
  level: Level;
  scope: string;
  args: Array<unknown>;
};

export type Transport = (message: LogMessage) => void;

const transports: Array<{
  logger: Transport;
  filters: Array<(message: LogMessage) => boolean>;
}> = [];

function shouldLog(
  logMessage: LogMessage,
  minLevel: Level,
  scopeThresholds: Scopes
) {
  const threshold = scopeThresholds[logMessage.scope] || minLevel;
  return levelToValue[logMessage.level] >= levelToValue[threshold];
}

type LogFunction = (...args: Array<unknown>) => void;

type Logger = {
  verbose: LogFunction;
  debug: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  fatal: LogFunction;
};

export function registerLogTransport(
  minLevel: Level,
  logger: Transport,
  scopeThresholds: Scopes = {}
) {
  const existing = transports.find(({ logger: e }) => e === logger);
  if (existing) {
    // Extend the filter
    existing.filters.push((logMessage) =>
      shouldLog(logMessage, minLevel, scopeThresholds)
    );
  } else {
    transports.push({
      logger,
      filters: [
        (logMessage) => shouldLog(logMessage, minLevel, scopeThresholds),
      ],
    });
  }
}

function log(message: LogMessage) {
  transports
    .filter(({ filters }) => filters.some((filter) => filter(message)))
    .forEach(({ logger }) => logger(message));
}

export default (scope: string): Logger => ({
  verbose(...args: Array<unknown>) {
    log({
      level: "VERBOSE",
      scope,
      args,
    });
  },
  debug(...args: Array<unknown>) {
    log({
      level: "DEBUG",
      scope,
      args,
    });
  },
  info(...args: Array<unknown>) {
    log({
      level: "INFO",
      scope,
      args,
    });
  },
  warn(...args: Array<unknown>) {
    log({
      level: "WARN",
      scope,
      args,
    });
  },
  error(...args: Array<unknown>) {
    log({
      level: "ERROR",
      scope,
      args,
    });
  },
  fatal(...args: Array<unknown>) {
    log({
      level: "FATAL",
      scope,
      args,
    });
  },
});
