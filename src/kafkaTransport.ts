import kafka, { KafkaClientOptions } from "kafka-node";
import { promisify } from "util";
import toString from "./toString";
import { LogMessage } from "./logger";

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

type Config = {
  service: string;
  instance: string;
  host: string;
  buildNumber: number;
};

export default function kafkaLogger(
  { service, instance, host, buildNumber }: Config,
  kafkaProperties: KafkaClientOptions
) {
  const client = new kafka.KafkaClient(kafkaProperties);

  const producer = new kafka.Producer(client);
  const close = promisify(producer.close);

  return {
    log(log: LogMessage) {
      producer.send(
        [createKafkaLog({ service, instance, host, buildNumber }, log)],
        () => {}
      );
    },
    async close() {
      try {
        // Use apply to ensure proper this context
        await close.apply(producer);
      } catch (e) {
        // At this point we probably don't have a functioning Kafka logger anymore, so write the error to console instead
        // eslint-disable-next-line no-console
        console.error(`Unable to close Kafka logger ${e}`);
      }
    },
  };
}
