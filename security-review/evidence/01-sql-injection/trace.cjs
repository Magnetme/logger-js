// Exploratory boundary check. No broker, database, production service or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const core = require(path.join(root, 'core/dist/cjs/index.js'));
const consoleTransport = require(path.join(root, 'consoleTransport/dist/cjs/index.js')).default;
const records = [];
const output = [];
const fakeConsole = Object.fromEntries(['log', 'info', 'warn', 'error'].map(method => [
  method, (...args) => output.push({ method, args }),
]));
let connected = false;
let disconnected = false;
const producer = {
  async connect() { connected = true; },
  async send(record) { records.push(record); },
  async disconnect() { disconnected = true; },
};
const entry = path.join(root, 'kafkaTransport/dist/cjs/index.js');
const actualRequire = createRequire(entry);
const kafkaModule = { exports: {} };
// Substitute only the external Kafka producer boundary. Serialization is real.
vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
  exports: kafkaModule.exports,
  require(id) {
    if (id === 'kafkajs') return {
      Kafka: class { producer() { return producer; } },
      Partitioners: { DefaultPartitioner() {} },
    };
    return actualRequire(id);
  },
  console: fakeConsole,
}, { filename: entry });

(async () => {
  const transport = await kafkaModule.exports.default({
    service: 'synthetic-service', instance: 'local', host: 'local', buildNumber: 1,
  }, { clientId: 'synthetic-client', brokers: [] });
  assert.equal(connected, true);
  const captured = [];
  core.registerLogTransport('VERBOSE', message => captured.push(message));
  core.registerLogTransport('VERBOSE', transport.log);
  const payloads = [
    "' OR 1=1 --", "x'); DROP TABLE synthetic_table; --",
    "'; SELECT pg_sleep(1); --", 'ordinary text', "O'Reilly",
    'SELECT id FROM synthetic_table WHERE id = $1',
  ];
  for (const value of payloads) {
    core.default(value).info(value, core.Markers.of({ [value]: value, service: value }));
    const message = captured.at(-1);
    assert.equal(message.scope, value);
    assert.equal(message.args[0], value);
    assert.equal(message.fields[value], value);
    const record = records.at(-1);
    assert.equal(record.topic, 'logs');
    assert.equal(record.messages.length, 1);
    const event = JSON.parse(record.messages[0].value);
    assert.equal(event.message, value);
    assert.equal(event.logger_name, value);
    assert.equal(event[value], value);
    assert.equal(event.service, 'synthetic-service');
    const originalInfo = console.info;
    const consoleCalls = [];
    try {
      console.info = (...args) => consoleCalls.push(args);
      consoleTransport(message);
    } finally { console.info = originalInfo; }
    assert.equal(consoleCalls.length, 1);
    assert.equal(consoleCalls[0][1], value);
    console.log(JSON.stringify({ input: value, sink: 'console and Kafka record data', kafkaTopic: record.topic }));
  }
  await transport.close();
  assert.equal(disconnected, true);
  assert.equal(records.length, payloads.length);
  assert.equal(output.filter(call => call.method === 'error').length, 0);
  console.log('PASS: six SQL-shaped/legitimate inputs preserved as data; metadata precedence and close verified. Kafka producer substituted; no downstream consumer or database tested.');
})().catch(error => { console.error(error); process.exitCode = 1; });
