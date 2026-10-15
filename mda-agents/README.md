# mda-agents

TypeScript agents for the MDA transformation pipeline described in the Master's thesis.

Implements two CIM languages and two PSM target platforms via a common,
schema-validated PIM intermediate layer (pimUML):

```
DEMO Fact Model (CIM)  --  demo-to-pim-agent.ts    (Rules A1-A12)  --+
                                                                       |
MERODE Domain Model (CIM) -- merode-to-pim-agent.ts (Rules M1-M9) --+--> pimUML (PIM)
                                                                       |
                                                                       +--> pim-to-mendix-agent.ts (Rules B1-B16) --> Mendix (PSM)
                                                                       +--> pim-to-sql-agent.ts    (Rules S1-S12) --> PostgreSQL DDL (PSM)
```

All agents communicate via the **BIG Modelling Bus** (MQTT, Eclipse Mosquitto/HiveMQ CE).
Details on the mapping rules: `thesis-notes/MAPPING_NOTES.md` (DEMO/MERODE->pimUML) and
the "S-Rules" section of `thesis-notes/MAPPING_NOTES.md` (pimUML->SQL). This README deliberately
no longer contains its own copy of the rule tables in order to avoid documentation drift.

---

## Project structure

```
mda-agents/
+-- bus-client.ts           # MQTT client (Layers 1-3, mirrors the Go Bus architecture)
+-- agent-utils.ts          # Shared helper functions: bus configuration, Ajv validation, meta-extraction
+-- demo-publisher.ts       # Reads rent-a-car-demo.json -> publishes to the bus
+-- demo-to-pim-agent.ts    # Subscribes to the DEMO model -> transforms (A1-A12) -> publishes PIM
+-- merode-to-pim-agent.ts  # Subscribes to MERODE model -> transforms (M1-M9) -> publishes to PIM
+-- pim-to-mendix-agent.ts  # Subscribes to PIM (DEMO+MERODE) -> generates Mendix app (B1-B16)
+-- pim-to-sql-agent.ts     # Subscribes to PIM (DEMO+MERODE) -> generates PostgreSQL DDL (S1-S12)
+-- api-server.ts           # HTTP request: POST /api/model (X-Input-Format: demo|merode)
|
+-- schemas/
|   +-- demo-schema.json    # JSON Schema (Draft-07) for the DEMO Fact Model (CIM)
|   +-- merode-schema.json  # JSON Schema (Draft-07) for the MERODE Domain Model (CIM)
|   +-- pimuml-schema.json  # JSON Schema (Draft-07) for the pimUML model (PIM)
|   +-- types.ts            # TypeScript interfaces, generated from the schemas
|
+-- tests/
|   +-- rent-a-car-demo.json    # Valid DEMO model (Rent-A-Car use case)
|   +-- rent-a-car-merode.json  # Valid MERODE model (Rent-A-Car use case)
|   +-- test-transform.ts       # Offline smoke test: partial section A3/A5/A12, no broker required
|   +-- smoke-m9-m3.ts          # Offline smoke test for M3/M9 (EDG propagation), no broker required
|   +-- test-sql-agent.ts       # Offline test for pim-to-sql-agent.ts
|   +-- pim-subscriber.ts       # Bus subscriber: displays the received PIM model
|   +-- README.md               # Details and caveats regarding the offline tests
|
+-- output/                 # Generated SQL DDL files (pim-to-sql-agent.ts), git-ignored
+-- docker-compose.yml      # Starts the MQTT broker and all agents as services
+-- mosquitto.conf          # Mosquitto configuration (anonymous, no persistence)
+-- package.json
+-- tsconfig.json
```

> Note on the offline tests: `test-transform.ts` and `smoke-m9-m3.ts` are standalone,
> hand-written partial reimplementations of the respective transformation logic (not the
> actual `transform()` functions from `demo-to-pim-agent.ts`/`merode-to-pim-agent.ts`). They
> are suitable as a quick smoke test without a broker, but are **not** a substitute for an
> end-to-end run via the bus (Option B below) or against the live pipeline. Details in
> `tests/README.md` and `thesis-notes/PROTOTYPE_TODOS.md`.

---

## Prerequisites

| Tool           | Version | Check              |
| -------------- | ------- | ------------------ |
| Node.js        | ≥ 18    | `node --version`   |
| npm            | ≥ 9     | `npm --version`    |
| Docker Desktop | ≥ 24    | `docker --version` |

```bash
# One-off: Install dependencies
cd mda-agents
npm install
```

---

## Testing

### Option A - Offline (no broker required)

```bash
npm run test:transform              # DEMO: Sub-section A3/A5/A12
npx ts-node tests/smoke-m9-m3.ts    # MERODE: M3/M9 (EDG propagation)
npx ts-node tests/test-sql-agent.ts # pim-to-sql-agent (S1-S12)
```

These three scripts are standalone smoke tests without an MQTT broker. Important: `test-transform.ts`
and `smoke-m9-m3.ts` are **not** calls to the actual `transform()` functions from
`demo-to-pim-agent.ts`/`merode-to-pim-agent.ts`, but separately maintained partial reimplementations
for quickly checking individual rules. To test the actual production logic,
Option B (full bus run-through) or a run against the live pipeline on the Pi is required.
Details, current fixture metrics and known limitations: `tests/README.md`.

---

### Option B - Full pipeline with bus (4 terminals)

**Terminal 1 - Start the MQTT broker**

```bash
cd mda-agents
npm run broker:up
# Mosquitto is running on localhost:1883
```

**Terminal 2 - Start the Transformer agent**

```bash
cd mda-agents
npm run demo-to-pim-agent
# Waits for incoming DEMO models
```

**Terminal 3 - Start the PIM subscriber** _(optional, for monitoring)_

```bash
cd mda-agents
npm run pim-subscriber
# Waits for outgoing PIM models
```

**Terminal 4 - Trigger the publisher** _(triggers the pipeline)_

```bash
cd mda-agents
npm run demo-publisher
```

**Expected flow:**

```
Terminal 4 (Publisher)
  -> Reads tests/rent-a-car-demo.json
  -> Publishes to topic:
    big/bus-version-1.0/dev/demo-publisher/artefacts/json/model.demo.raw/demo-v1.0-v1.0/state

Terminal 2 (Transformer)
  -> Receives DemoModel
  -> Validates against demo-schema.json
  -> Executes A1-A12 (15 classes, 20 associations, ...)
  -> Validates against pimuml-schema.json
  -> Publishes to topic:
    big/bus-version-1.0/dev/demo-to-pim-agent/artefacts/json/model.pim.created/pimuml-v1.0-v1.0/state

Terminal 3 (Subscriber)
  -> Receives PimModel
  -> Writes tests/rent-a-car-pim-from-bus.json
```

**Stop broker:**

```bash
npm run broker:down
```

---

## Configuration

All agents read their connection parameters from environment variables:

| Variable             | Default            | Meaning         |
| -------------------- | ------------------ | --------------- |
| `MQTT_BROKER`        | `localhost`        | Broker hostname |
| `MQTT_PORT`          | `1883`             | Broker port     |
| `MQTT_USER`          | `admin`            | MQTT username   |
| `MQTT_PASSWORD`      | `admin`            | MQTT password   |
| `BUS_PREFIX`         | `big`              | Topic prefix    |
| `BUS_ENVIRONMENT_ID` | `dev`              | Environment ID  |
| `BUS_AGENT_ID`       | _(agent-specific)_ | Agent ID        |

For `pim-to-mendix-agent.ts`, additionally (Mendix Platform SDK, see `.env.example`):
`MENDIX_TOKEN`, `MENDIX_APP_ID`, `MENDIX_MODULE_NAME`, `MENDIX_BRANCH`.

Example using your own broker:

```bash
MQTT_BROKER=my-server.example.com MQTT_USER=user MQTT_PASSWORD=pw \
  npm run demo-to-pim-agent
```

---

## Mapping Rules

The complete, currently valid rule tables (A1-A12 for DEMO, M1-M9 for MERODE,
B1-B16 for Mendix, S1-S12 for PostgreSQL) are **not** duplicated here to avoid documentation drift,
but are maintained centrally in `thesis-notes/MAPPING_NOTES.md`
(see also `thesis-notes/MerodeMappingRules.md` for the MERODE-specific derivation).
