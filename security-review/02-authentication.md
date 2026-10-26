# Authentication review: remove Kafka credential output

One defect is confirmed and fixed: the Kafka transport printed the entire connection configuration to stdout before connecting. Synthetic tests reproduced disclosure of SASL passwords, TLS key material and custom provider secrets. Removing that print preserves the configuration passed to KafkaJS and ordinary log delivery. No other authentication defect was confirmed in this checkout.

Reviewed on 26 October 2026, starting at `48fcb211c01bfd0fea4bf3d0e4e6fbd8d0b5bc0c`. Branch: `codex/security-review-20261026-02-authentication`. Worktree: `/home/alex/.codex/worktrees/b0b1/logger-js`. This review covers logger-js, its console and Kafka transports, and the dependency interfaces and build configuration present here. It does not establish whether production used these options or retained this output.

## AUTH-01: startup output exposes authentication credentials

**Confirmed, fixed. CWE-532 / CWE-522. High potential impact; exploitation depends on access to logs and usable broker credentials.**

At the base commit, [`kafkaTransport/src/index.ts:44–56`](https://github.com/Magnetme/logger-js/blob/48fcb211c01bfd0fea4bf3d0e4e6fbd8d0b5bc0c/kafkaTransport/src/index.ts#L44-L56) accepts a KafkaJS `KafkaConfig` and calls `console.log(kafkaProperties)` before creating the client or awaiting its connection. KafkaJS 2.2.4 supports SASL PLAIN and SCRAM passwords, AWS credentials, custom authentication providers, OAuth providers, and TLS connection options. These are caller configuration, not ordinary log content.

The path is: a consuming service supplies authentication configuration → transport startup prints the whole object → stdout collectors or readers receive its inspectable secret values → a reader can attempt to reuse valid credentials against a reachable broker, within the principal's permissions. The print happens even when the connection subsequently fails. This review confirmed the disclosure, not credential reuse against a live broker.

The five failing regressions demonstrated passwords for PLAIN, SCRAM-SHA-256 and SCRAM-SHA-512, plus TLS private key/passphrase/PFX bytes and custom provider options. All values are synthetic. AWS credential fields share the same object-print sink, but were inspected through dependency types rather than tested separately. An OAuth provider function is not invoked by the print; its returned token is not demonstrated to leak through this path.

The fix removes the configuration dump entirely. Filtering only familiar password keys would leave TLS material and custom provider fields exposed. The same object still reaches `new Kafka(...)`; no authentication settings are rewritten. Existing stdout access restrictions may limit exposure, and broker ACLs constrain the damage from reused credentials. Those controls do not prevent secret disclosure to readers who can see this output.

If deployed services supplied secrets here, their owners should assess retained startup logs and rotate exposed credentials as appropriate. This review did not inspect those services or logs, retrieve real credentials, or make operational changes.

## Coverage and rejected suspicions

| Surface | Evidence and input path | Authentication assessment |
| --- | --- | --- |
| Core logger | [`core/src/index.ts:14–42`](../core/src/index.ts), [`69–149`](../core/src/index.ts): caller scopes, arguments and marker fields flow through registered transports and severity filters. | No inbound listener, identity verification, credential store, session or token parser. In-process transport registration is an intended trusted-code API. Untrusted text logged by a caller does not become Kafka authentication configuration. |
| Console transport | [`consoleTransport/src/index.ts:3–31`](../consoleTransport/src/index.ts): scope and arguments reach console methods. | No authentication implementation or security decision. Credentials deliberately included by an external caller in ordinary log arguments are outside a demonstrated authentication bypass here; general logging disclosure belongs to topic 06. |
| Kafka configuration | Base [`kafkaTransport/src/index.ts:44–56`](https://github.com/Magnetme/logger-js/blob/48fcb211c01bfd0fea4bf3d0e4e6fbd8d0b5bc0c/kafkaTransport/src/index.ts#L44-L56); fixed [`44–55`](../kafkaTransport/src/index.ts). | AUTH-01. SASL/TLS configuration passes directly to KafkaJS, with no anonymous fallback in this wrapper. An error from `producer.connect()` rejects initialization. |
| Kafka event creation | [`kafkaTransport/src/index.ts:5–29`](../kafkaTransport/src/index.ts): marker fields, scope, message and configured service metadata become a JSON record on `logs`. | Event fields do not reconfigure broker authentication. Standard service, instance and host fields override marker fields. This metadata describes events; no code here treats it as a verified user identity. Downstream consumers are absent. |
| Kafka delivery and shutdown | [`kafkaTransport/src/index.ts:59–100`](../kafkaTransport/src/index.ts): send, closed-producer warning, synchronous error fallback and disconnect. | No local privilege/session state or alternate unauthenticated connection. Warnings/errors may include log arguments or dependency error text; no additional path from the stored configuration to these messages was confirmed. |
| Serialization | [`kafkaTransport/src/toString.ts:1–34`](../kafkaTransport/src/toString.ts): strings, errors and ordinary objects become message text. | No credential verification, identity lookup, OAuth/JWT decoding or authentication decision. Caller-controlled objects remain log content. |
| Dependency interface | [`kafkaTransport/package.json`](../kafkaTransport/package.json), [`yarn.lock`](../kafkaTransport/yarn.lock); installed KafkaJS 2.2.4 source listed below. | Broker authentication and TLS are delegated. Optional SASL/SSL alone is not evidence of a bypass: local/test brokers and caller-supplied security policies are supported. No production configuration is present to prove an insecure deployment. |
| Build/repository infrastructure | All tracked files at the base; package scripts, lockfiles, `base-tsconfig.json`, each package's TS configs, `.nvmrc`, README and `.gitignore`. | No HTTP authentication endpoints, password reset/registration flows, account database, signing keys, container/cluster manifests, CI authentication workflow or checked-in broker deployment configuration. |

Dependency source inspected after a frozen-lockfile install:

- `kafkajs/types/index.d.ts:44–97`: `KafkaConfig`, TLS options, built-in SASL credential shapes, custom provider and OAuth callback interfaces.
- `kafkajs/src/index.js:35–100`: forwards SASL/TLS configuration into the client cluster.
- `kafkajs/src/producer/index.js:218–227` and `src/broker/index.js:79–115`: connects through the cluster and awaits connection authentication.
- `kafkajs/src/network/connection.js:130–142` and `src/broker/saslAuthenticator/index.js`: authentication completes before the connection is marked authenticated; built-in or caller-provided mechanisms are selected.
- `kafkajs/src/broker/saslAuthenticator/plain.js`: missing username/password rejects; authentication errors propagate.
- `kafkajs/src/network/socketFactory.js`: TLS options go to Node's `tls.connect`; this wrapper does not disable certificate verification.

These references describe the installed, integrity-checked 2.2.4 dependency, not an audit of every KafkaJS implementation detail. The local dependency tree is ignored; its version and tarball integrity are preserved in the tracked lockfile.

## Regression-first evidence

The [test harness](../kafkaTransport/test/authentication.test.cjs) executes the actual compiled CommonJS transport and its real serializer. It replaces the Kafka client and console, formats captured output with Node's `util.format`, and never opens a socket. Connection, delivery and close controls exercise the wrapper's intended behavior; they do not prove a broker handshake.

1. Starting HEAD matched the shared base and the assigned branch was created from it. Production source remained unchanged while adding the tests.
2. `cd kafkaTransport && yarn test` failed with **five credential-disclosure failures and two passing controls**. Each failure was an assertion against disclosed synthetic output; compilation, fixture setup and dependency imports succeeded. [Before output](evidence/02-authentication/regression-before.log).
3. Tests and failure evidence were committed as `7f0c562feaf1bc516d6ab2af4cfad56cb76ef9f9` (`test: reproduce Kafka authentication credential disclosure`). This intentionally failing commit contains no production source change.
4. A separate commit, `856b0dfab987047b2a9407fdfc1cddc311f51750` (`fix: stop printing Kafka authentication configuration`), removes the print. `cd kafkaTransport && yarn test` then passed **all seven tests**. [After output](evidence/02-authentication/regression-after.log).

The controls verify configuration object identity, OAuth callback and TLS verification callback preservation, ordinary event delivery, connect/disconnect, and propagation of a rejected connection without another client or anonymous retry.

Each package passed `yarn run build && yarn run format:ci`: [core](evidence/02-authentication/core-checks.log), [console](evidence/02-authentication/consoleTransport-checks.log), [Kafka](evidence/02-authentication/kafkaTransport-checks.log). The new test file also passed [Prettier](evidence/02-authentication/test-format.log); `git diff --check` passed. No pre-existing test script was present in these packages.

Dependencies were installed using `yarn install --frozen-lockfile --ignore-scripts --non-interactive --cache-folder /tmp/logger-js-authentication-yarn-cache --registry https://registry.npmjs.org` in each package. Initial installs using the default registry/cache failed integrity checks and were not treated as regression failures. The isolated-cache/npm-registry installs passed integrity checks without changing lockfiles. Runtime: [Node v24.8.0](evidence/02-authentication/runtime.txt), Yarn 1.22.19, TypeScript 4.9.5. `.nvmrc` requests Node 18.14.0; that runtime was not tested.

Reproduce the sequence after installing the locked dependencies:

```sh
git show --stat 7f0c562feaf1bc516d6ab2af4cfad56cb76ef9f9
git diff 7f0c562feaf1bc516d6ab2af4cfad56cb76ef9f9^ 7f0c562feaf1bc516d6ab2af4cfad56cb76ef9f9 -- kafkaTransport/src
git show 856b0dfab987047b2a9407fdfc1cddc311f51750 -- kafkaTransport/src/index.ts
cd kafkaTransport
yarn test
```

The second command must produce no production diff. To rerun the red state, use a separate disposable checkout at the test commit and build there; preserve this review worktree.

## Duplicates, limits and handoff

The shared queue was checked before reporting. No other completed topic or prior finding was available to deduplicate; the coordinator already records this finding as **AUTH-01**. Topic 06 should reference AUTH-01 for the same configuration dump rather than count it again. Topics 28/29 still own their OAuth/JWT coverage; only the Kafka configuration boundary is assessed here.

Coverage gaps: consuming services and their login/session/reset/MFA policies are absent; broker authentication/ACL/TLS configuration and network exposure are absent; real log retention/read permissions and past secret exposure are unknown. Broker authentication protocols and certificate validation were traced in the dependency source but not exercised against a broker. No production systems were probed and no `mmdev` environment was required. Node 18 and other runtime versions were not verified.

The preserved [base inventory](evidence/02-authentication/base-inventory.txt) and [surface search](evidence/02-authentication/base-surface-search.txt) support the scope; the assessment also read every production source file, manifest and build configuration. Push verification and exact report commit are recorded in `02-authentication.result.json`; the final chat response records the final metadata commit and verified remote tip. No PR was created or approved.
