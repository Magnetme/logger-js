import { LogMessage, Transport } from "@magnet.me/logger-js";

function logPrefix(message: LogMessage) {
  return `${new Date().toISOString()} [${message.scope}] ${message.level}:`;
}

const consoleTransport: Transport = (message: LogMessage) => {
  switch (message.level) {
    case "VERBOSE":
      console.info(logPrefix(message), ...message.args);
      break;
    case "DEBUG":
      console.info(logPrefix(message), ...message.args);
      break;
    case "INFO":
      console.info(logPrefix(message), ...message.args);
      break;
    case "WARN":
      console.warn(logPrefix(message), ...message.args);
      break;
    case "ERROR":
      console.error(logPrefix(message), ...message.args);
      break;
    case "FATAL":
      console.error(logPrefix(message), ...message.args);
      break;
    default:
      // noop
      break;
  }
};

export default consoleTransport;
