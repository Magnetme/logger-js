import { Kafka, KafkaConfig, ProducerRecord, Partitioners } from "kafkajs";
import { LogMessage, Transport } from "@magnet.me/logger-js";
import toString from "./toString";

function createKafkaLog(
  { service, instance, host, buildNumber }: Config,
  log: LogMessage
): ProducerRecord {
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
    messages: [
      {
        value: JSON.stringify(message),
      },
    ],
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

export default async function kafkaTransport(
  { service, instance, host, buildNumber }: Config,
  kafkaProperties: KafkaConfig
): Promise<KafkaTransport> {
  console.log(kafkaProperties);
  const client = new Kafka(kafkaProperties);

  let closed = false;

  const producer = client.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  });
  await producer.connect();

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
        const messagePromise = producer.send(
          createKafkaLog({ service, instance, host, buildNumber }, log)
        );
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
        await producer.disconnect();
      } catch (e) {
        // At this point we probably don't have a functioning Kafka logger anymore, so write the error to console instead
        // eslint-disable-next-line no-console
        console.error(`Unable to close Kafka logger ${e}`);
      }
    },
  };
}
