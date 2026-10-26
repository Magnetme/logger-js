# SQL injection: no defect confirmed in logger-js

Reviewed on 26 October 2026 at base commit `48fcb211c01bfd0fea4bf3d0e4e6fbd8d0b5bc0c`. The managed worktree started clean and detached at that commit. Review branch: `codex/security-review-20261026-01-sql-injection`.

There is no SQL execution sink in the reviewed code. Keep SQL-shaped log content intact: escaping it here would change legitimate diagnostics and would not protect an absent downstream SQL consumer. Review parameter binding in downstream consumers separately if they write these events to a database.

## Coverage and input paths

All 20 tracked files at the base were inspected: four TypeScript source files, three package manifests, three lockfiles, seven TypeScript configurations, README, `.nvmrc` and `.gitignore`. There are no tracked services, HTTP handlers, database migrations, deployment manifests or CI definitions. The file inventory, package versions and compiled imports are in [inventory.txt](evidence/01-sql-injection/inventory.txt).

| Surface | Input path and actual effect | SQL assessment |
| --- | --- | --- |
| Core logger | Caller-supplied scope and arguments enter six level methods in [core/src/index.ts](../core/src/index.ts#L106). [Marker construction](../core/src/index.ts#L21) snapshots fields and drops prototype-related keys. [Dispatch](../core/src/index.ts#L90) separates markers, merges fields and invokes registered callbacks after level/scope filtering. | No query construction or execution. Callback implementations supplied by consuming applications are outside the repository. Marker key filtering and thresholds are not SQL protections. |
| Console transport | [consoleTransport/src/index.ts](../consoleTransport/src/index.ts#L3) interpolates timestamp, scope and level into a prefix, then passes arguments to console methods according to severity. | Console output is the sink. A SQL fragment remains output text; nothing passes it to a database. |
| Kafka transport | [kafkaTransport/src/index.ts](../kafkaTransport/src/index.ts#L5) spreads marker fields into an event, then assigns standard metadata so it wins collisions. Argument strings are joined into the message; the event is JSON-encoded into one record on the fixed `logs` topic. [The log method](../kafkaTransport/src/index.ts#L61) sends that record through the producer. The closed/error paths write to console; close awaits outstanding sends and disconnects. | SQL-shaped keys, scopes, metadata and values remain Kafka record data. No SQL parser or database call appears in any branch. JSON encoding protects the event structure; it is not SQL escaping. |
| Argument conversion | [kafkaTransport/src/toString.ts](../kafkaTransport/src/toString.ts#L3) preserves strings, serializes error-like values, tries JSON serialization, then a value's `toString`, then a fixed fallback. | None of these paths executes SQL. Custom object callbacks can execute application code, but their existence is not an attacker-to-SQL path demonstrated here. |
| Dependency interfaces | Core has no runtime dependencies. Console's logger import is type-only in emitted code. Kafka emits imports for KafkaJS and its local conversion helper; conversion imports `serialize-error`. [Kafka package manifest](../kafkaTransport/package.json#L22) and all lockfiles were inspected, including `type-fest` and `undici-types`. | No database driver, ORM or SQL builder is declared or locked. KafkaJS is used only through producer construction, connect, send and disconnect. Dependency implementation and supply-chain security are not exhaustively audited. |
| Build/configuration | All package scripts and TypeScript configurations were read. Scripts compile, format, clean or prepare publishing; configuration supplies compiler/module settings. | No SQL infrastructure or execution surface is present. Build and prepublish scripts were not used to publish anything. |

## Rejected suspicions and duplicates

SQL fragments can reach console output and Kafka messages unchanged. That is expected logging behavior, not confirmed SQL injection: this checkout contains no SQL interpreter receiving them. Similarly, a custom transport could concatenate event fields into SQL, but neither that implementation nor an exploit path is present here. These are coverage boundaries, not findings against the library.

No confirmed findings or duplicates were recorded. The shared queue was read before the review; no completed topic report was available for duplicate comparison then. No regression-first or fix commit was created because no production defect was demonstrated. The boundary check below is exploratory evidence, not a failing security regression.

## Checks and evidence

Build dependencies were copied into this worktree from the existing project's package-local `node_modules`, without installing packages or running lifecycle scripts. Installed versions match the lockfile versions reported in the inventory. No production credentials, records, broker or database were used. `mmdev` was not needed or started.

| Command | Outcome | Evidence |
| --- | --- | --- |
| `git rev-parse HEAD`; `git status --short`; `git switch -c codex/security-review-20261026-01-sql-injection 48fcb211c01bfd0fea4bf3d0e4e6fbd8d0b5bc0c` | Base matched; worktree was clean; branch created. Initial switch hit a sandbox read-only Git metadata error; the exact command succeeded through supported escalation. | Base and branch recorded in [inventory.txt](evidence/01-sql-injection/inventory.txt). |
| `git grep -n -i -E 'sql\|query\|execute\|sequelize\|knex\|prisma\|typeorm\|postgres\|mysql\|sqlite\|mssql\|oracle\|jdbc\|odbc\|clickhouse\|snowflake\|database' 48fcb211c01bfd0fea4bf3d0e4e6fbd8d0b5bc0c --` | Exit 1: no matches. This only corroborates the manual source trace. | [inventory.txt](evidence/01-sql-injection/inventory.txt). |
| `(cd core && yarn run build)` | Exit 0; ESM and CommonJS compiled. | [build-core.txt](evidence/01-sql-injection/build-core.txt). |
| `(cd consoleTransport && yarn run build)` | Exit 0; ESM and CommonJS compiled. | [build-consoleTransport.txt](evidence/01-sql-injection/build-consoleTransport.txt). |
| `(cd kafkaTransport && yarn run build)` | Exit 0; ESM and CommonJS compiled. | [build-kafkaTransport.txt](evidence/01-sql-injection/build-kafkaTransport.txt). |
| `node security-review/evidence/01-sql-injection/trace.cjs` | Exit 0. Three SQL-shaped inputs plus plain text, an apostrophe-containing name and a legitimate SQL diagnostic remained data through the actual built core, console and Kafka event serializer. Scope, argument and marker values were preserved; the fixed topic, standard service metadata precedence and close behavior were checked. | [trace.cjs](evidence/01-sql-injection/trace.cjs), [trace.txt](evidence/01-sql-injection/trace.txt). |

The trace substitutes the Kafka producer boundary and uses the real compiled conversion helper and installed serializer. It sends no network traffic. Builds and trace ran on existing Node `v24.8.0`, TypeScript `4.9.5` and Yarn `1.22.19`; the repository pins Node `v18.14.0`. Node 18 compatibility was not tested. Yarn emitted cache/global-directory warnings but all three builds exited successfully.

The report and evidence are committed and pushed on the assigned branch. The accompanying `01-sql-injection.result.json` records the resulting commit, remote-tip verification and any blocker after that operation; it is saved locally after the push so it can contain the actual final SHA without a self-reference.

## Coverage limits

Downstream Kafka consumers, log ingestion and database storage, application-defined transports, deployed package artifacts and consuming services are absent from this checkout and remain unreviewed. The isolated trace does not exercise KafkaJS protocol internals or a real broker, database or production deployment. No claim is made about SQL injection in those systems. This review's no-defect conclusion is limited to the source and declared interfaces at the recorded base.
