const assert = require("node:assert/strict");
const { test } = require("node:test");
const { default: logger, registerLogTransport } = require("../dist/cjs");

function emittedLevels(scope, minLevel, thresholds) {
  const received = [];
  registerLogTransport(
    minLevel,
    (message) => received.push(message),
    thresholds
  );
  const scoped = logger(scope);
  for (const method of ["verbose", "debug", "info", "warn", "error", "fatal"]) {
    scoped[method]("synthetic audit event");
  }
  return received.map(({ level }) => level);
}

test("ordinary scopes respect the transport minimum", () => {
  assert.deepEqual(emittedLevels("OrderProcessor", "INFO"), [
    "INFO",
    "WARN",
    "ERROR",
    "FATAL",
  ]);
});

for (const scope of Object.getOwnPropertyNames(Object.prototype)) {
  test(`unconfigured scope ${scope} preserves qualifying audit events`, () => {
    assert.deepEqual(emittedLevels(scope, "INFO"), [
      "INFO",
      "WARN",
      "ERROR",
      "FATAL",
    ]);
  });
}

test("explicit own scope thresholds still override the minimum", () => {
  assert.deepEqual(
    emittedLevels("OrderProcessor", "INFO", { OrderProcessor: "ERROR" }),
    ["ERROR", "FATAL"]
  );
});

test("explicit prototype-named scopes can still be configured", () => {
  assert.deepEqual(
    emittedLevels("constructor", "INFO", { constructor: "ERROR" }),
    ["ERROR", "FATAL"]
  );
  assert.deepEqual(
    emittedLevels("__proto__", "ERROR", JSON.parse('{"__proto__":"DEBUG"}')),
    ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]
  );
});

test("null-prototype threshold maps remain supported", () => {
  const thresholds = Object.create(null);
  thresholds.hasOwnProperty = "WARN";
  assert.deepEqual(emittedLevels("hasOwnProperty", "INFO", thresholds), [
    "WARN",
    "ERROR",
    "FATAL",
  ]);
});
