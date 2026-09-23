###Logger JS

Standardized logging framework for Magnet.me JavaScript services. 

It provides ways to set up scoped loggers, which can then write to one or more central transports.
Each transport can configure the log thresholds separately, and even scope these per log message scope. 
Additionally, provides a console transport as well as a Kafka transport to hook into the framework.
Additional transports should be created and hooked into the framework separately.

## Structured fields

```ts
import logger, { Markers } from "@magnet.me/logger-js";

logger("OrderProcessor").info("Processing order", Markers.of({
  orderId: "order-123",
  attempt: 2,
}));
```

Markers are removed from message arguments and exposed as `LogMessage.fields`.
Ordinary objects and errors remain normal message arguments. Multiple markers are
merged in argument order, with later values winning. Marker fields are shallow
snapshots; nested values should not be mutated after logging. Prototype-related
keys are discarded. Each log call builds its own field object without shared state.
Work is linear in the argument and marker-field counts.

The Kafka transport adds marker fields to the event root; its standard fields,
such as `message`, `level` and `service`, take precedence. Other transports may
ignore the optional fields.
