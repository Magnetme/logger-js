const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const { format } = require("node:util");
const { runInNewContext } = require("node:vm");

// Execute the compiled transport and its real serializer. Only the Kafka client
// and console are replaced, so no credentials or messages leave this process.
function fixture(connectionError) {
  const output = [];
  const calls = { configs: [], records: [], connects: 0, disconnects: 0 };
  const filename = path.resolve(__dirname, "../dist/cjs/index.js");
  const realRequire = createRequire(filename);
  const producer = {
    async connect() {
      calls.connects++;
      if (connectionError) throw connectionError;
    },
    async send(record) {
      calls.records.push(record);
    },
    async disconnect() {
      calls.disconnects++;
    },
  };
  const exports = {};
  runInNewContext(
    readFileSync(filename, "utf8"),
    {
      exports,
      require(id) {
        if (id !== "kafkajs") return realRequire(id);
        return {
          Partitioners: realRequire("kafkajs").Partitioners,
          Kafka: class {
            constructor(config) {
              calls.configs.push(config);
            }
            producer() {
              return producer;
            }
          },
        };
      },
      console: Object.fromEntries(
        ["log", "info", "warn", "error", "debug"].map((level) => [
          level,
          (...args) => output.push(format(...args)),
        ])
      ),
    },
    { filename }
  );
  return { create: exports.default, calls, output };
}

const service = {
  service: "synthetic-service",
  instance: "synthetic-instance",
  host: "synthetic-host",
  buildNumber: 123,
};

for (const mechanism of ["plain", "scram-sha-256", "scram-sha-512"]) {
  test(`keeps ${mechanism} credentials out of console output`, async () => {
    const { create, calls, output } = fixture();
    const config = {
      brokers: ["synthetic.invalid:9093"],
      ssl: true,
      sasl: {
        mechanism,
        username: "synthetic-user",
        password: "synthetic-password-never-log",
      },
    };
    const transport = await create(service, config);
    await transport.close();
    assert.strictEqual(calls.configs[0], config);
    assert.equal(calls.connects, 1);
    assert.equal(calls.disconnects, 1);
    assert.doesNotMatch(output.join("\n"), /synthetic-password-never-log/);
  });
}

test("keeps TLS private key, passphrase and PFX data out of console output", async () => {
  const { create, calls, output } = fixture();
  const config = {
    brokers: ["synthetic.invalid:9093"],
    ssl: {
      key: "synthetic-private-key-never-log",
      passphrase: "synthetic-passphrase-never-log",
      pfx: Buffer.from("synthetic-pfx-never-log"),
      rejectUnauthorized: true,
    },
  };
  const transport = await create(service, config);
  await transport.close();
  assert.strictEqual(calls.configs[0].ssl, config.ssl);
  assert.equal(output.length, 0, output.join("\n"));
});

test("keeps custom authentication provider options out of console output", async () => {
  const { create, calls, output } = fixture();
  const config = {
    brokers: ["synthetic.invalid:9093"],
    ssl: true,
    sasl: {
      mechanism: "custom",
      authenticationProvider: () => ({ authenticate: async () => {} }),
      providerSecret: "synthetic-provider-secret-never-log",
    },
  };
  const transport = await create(service, config);
  await transport.close();
  assert.strictEqual(calls.configs[0].sasl, config.sasl);
  assert.doesNotMatch(output.join("\n"), /synthetic-provider-secret-never-log/);
});

test("preserves OAuth/TLS settings and ordinary log delivery", async () => {
  const { create, calls } = fixture();
  const provider = async () => ({ value: "synthetic-oauth-token" });
  const checkServerIdentity = () => undefined;
  const config = {
    brokers: ["synthetic.invalid:9093"],
    ssl: { rejectUnauthorized: true, checkServerIdentity },
    sasl: { mechanism: "oauthbearer", oauthBearerProvider: provider },
  };
  const transport = await create(service, config);
  transport.log({
    level: "INFO",
    scope: "AuthenticationControl",
    args: ["ok"],
  });
  await transport.close();
  assert.strictEqual(calls.configs[0], config);
  assert.strictEqual(calls.configs[0].sasl.oauthBearerProvider, provider);
  assert.strictEqual(
    calls.configs[0].ssl.checkServerIdentity,
    checkServerIdentity
  );
  assert.equal(calls.records.length, 1);
  assert.equal(calls.records[0].topic, "logs");
  const event = JSON.parse(calls.records[0].messages[0].value);
  assert.equal(event.message, "ok");
  assert.equal(event.service, service.service);
  assert.equal(event.logger_name, "AuthenticationControl");
  assert.equal(calls.connects, 1);
  assert.equal(calls.disconnects, 1);
});

test("propagates a rejected authenticated connection without retrying anonymously", async () => {
  const rejected = new Error("Synthetic authentication rejection");
  const { create, calls } = fixture(rejected);
  const config = {
    brokers: ["synthetic.invalid:9093"],
    ssl: true,
    sasl: { mechanism: "plain", username: "synthetic", password: "synthetic" },
  };
  await assert.rejects(create(service, config), (error) => error === rejected);
  assert.equal(calls.configs.length, 1);
  assert.strictEqual(calls.configs[0], config);
  assert.equal(calls.connects, 1);
  assert.equal(calls.records.length, 0);
});
