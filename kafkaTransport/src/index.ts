import kafka, { KafkaClientOptions } from "kafka-node";
import { LogMessage, Transport } from "@magnet.me/logger-js";
import { promisify } from "util";
import toString from "./toString";

function createKafkaLog(
  { service, instance, host, buildNumber }: Config,
  log: LogMessage
) {
  const message = {
    "@version": 1,
    "@timestamp": new Date().toISOString(),
    logger_name: log.scope,
    message: log.args.map(toString).join(" "),
    level: log.level,
    instance,
    service,
    consul_hostname: host,
    build: buildNumber,
  };

  return {
    topic: "logs",
    messages: JSON.stringify(message),
  };
}

export type Config = {
  service: string;
  instance: string;
  host: string;
  buildNumber: number;
};

export type KafkaTransport = {
  log: Transport;
  close: () => Promise<void>;
};

export default function kafkaTransport(
  { service, instance, host, buildNumber }: Config,
  kafkaProperties: KafkaClientOptions
): KafkaTransport {
  const client = new kafka.KafkaClient(kafkaProperties);

  let closed = false;

  const producer = new kafka.Producer(client);
  const close = promisify(producer.close).bind(producer);
  const send = promisify(producer.send).bind(producer);

  const outstandingMessages = new Set<Promise<unknown>>();

  return {
    log(log: LogMessage) {
      try {
        if (closed) {
          // eslint-disable-next-line no-console
          console.warn(
            "Not sending message because producer is closed",
            { service, instance, host, buildNumber },
            log
          );
          return;
        }
        const messagePromise = send([
          createKafkaLog({ service, instance, host, buildNumber }, log),
        ]);
        outstandingMessages.add(messagePromise);
        messagePromise.then(
          () => outstandingMessages.delete(messagePromise),
          () => outstandingMessages.delete(messagePromise)
        );
      } catch (e) {
        // At this point we probably don't have a functioning Kafka logger anymore, so write the error to console instead
        // eslint-disable-next-line no-console
        console.error(
          `Unable to send Kafka log message due to ${e}`,
          { service, instance, host, buildNumber },
          log
        );
      }
    },
    async close() {
      try {
        closed = true;
        await Promise.all([...outstandingMessages]);
        // Use apply to ensure proper this context
        await close();
      } catch (e) {
        // At this point we probably don't have a functioning Kafka logger anymore, so write the error to console instead
        // eslint-disable-next-line no-console
        console.error(`Unable to close Kafka logger ${e}`);
      }
    },
  };
}
