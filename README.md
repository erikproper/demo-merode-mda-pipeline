# Modelling Bus: An agent-based MDA pipeline

Prototype for the Master's thesis _Modelling Bus_ (Business Informatics, Vienna University of Technology).
Supervisor: Univ.Prof. Henderik A. Proper.

This repository contains the executable implementation and all
evaluation artefacts referred to in the thesis.

The pipeline transforms enterprise models from two different
modelling languages via a common, schema-validated
intermediate layer into two different target platforms. The agents run
in a decoupled manner and communicate exclusively via a message bus.

```
DEMO Fact Model (CIM)  --->  demo-to-pim-agent    (Rules A1-A12)  --+
                                                                      |
MERODE Domain Model (CIM) -> merode-to-pim-agent  (Rules M1-M9)   --+--> pimUML (PIM)
                                                                      |
                                                                      +--> pim-to-mendix-agent (Rules B1-B16) --> Mendix App (PSM)
                                                                      +--> pim-to-sql-agent    (Rules S1-S12) --> PostgreSQL DDL (PSM)
```

Communication takes place via MQTT. Each agent has its own topic namespace
following the pattern `{prefix}/bus-version-1.0/{environmentID}/{agentID}/{path}`.
Models are published as _retained messages_ so that agents started later
can still access the last known state.

A running instance can be accessed at `https://mda.tlolab.com`.

---

## Repository structure

```
.
+-- mda-agents/              # The implementation (TypeScript). Custom code.
|   +-- bus-client.ts        #   MQTT client, mirrors layers 1-3 of the Go bus
|   +-- agent-utils.ts       #   Bus configuration, Ajv validation, meta-extraction
|   +-- demo-to-pim-agent.ts #   DEMO Fact Model  -> pimUML   (A1-A12)
|   +-- merode-to-pim-agent.ts #  MERODE Domain Model -> pimUML (M1-M9)
|   +-- pim-to-mendix-agent.ts #  pimUML -> Mendix App        (B1-B16)
|   +-- pim-to-sql-agent.ts  #   pimUML -> PostgreSQL DDL     (S1-S12)
|   +-- api-server.ts        #   HTTP endpoints: POST /api/model, GET /health
|   +-- schemas/             #   JSON Schema (Draft-07) for CIM and PIM
|   +-- tests/               #   Offline tests and verification scripts
|   +-- README.md            #   Details on agents, topics and execution
|
+-- thesis-notes/            # Documentation of the thesis. Original text.
|   +-- ARCHITECTURE.md      #   Architecture and design layers
|   +-- REQUIREMENTS.md      #   AR/PR/QR requirements and RQ1-RQ4
|   +-- MAPPING_NOTES.md     #   All transformation rules A/M/B/S with references
|   +-- MerodeMappingRules.md #  MERODE rules M1-M9 in detail
|   +-- SqlMappingRules.md   #   SQL rules S1-S12 in detail
|   +-- DESIGN_DECISIONS.md  #   Design decisions DD1-DD13
|   +-- EXTENSIBILITY_EVIDENCE.md # Evidence of extensibility
|   +-- LIMITATIONS.md       #   Known limitations of the prototype
|   +-- PROTOTYPE_TODOS.md   #   Outstanding issues and thesis decisions
|   +-- EVAL/                #   GENERATED artefacts, see section below
|
+-- thesis-context/          # Source material and preliminary work. Some of it from external sources.
+-- big-modelling-bus.go.v1/ # Reference implementation in Go. External code.
+-- docker-compose.yml       # Broker and all agents as services
+-- deploy.sh                # Manual deployment to the Raspberry Pi
+-- cloudflare-tunnel.md     # Setting up the public endpoint
+-- Architecture.pdf         # Architecture diagram of the pipeline
```

---

## Generated and versioned artefacts

**Important for traceability:** The folder `thesis-notes/EVAL/`
(approx. 3.4 MB, 17 files) does not contain any handwritten documents,
but rather **outputs from the pipeline**. These files have been deliberately
checked in so that the figures in the thesis remain verifiable without having to run the pipeline
yourself. They are regenerated with every run.

| Path                                       | Content                                           | Source      |
| ------------------------------------------ | ------------------------------------------------- | ----------- |
| `thesis-notes/EVAL/FRAMEWORK.md`           | Evaluation framework, measurement tables, results | handwritten |
| `thesis-notes/EVAL/*-pim-output.json`      | pimUML models of the four test cases              | generated   |
| `thesis-notes/EVAL/Eval_new/*-pim.json`    | pimUML models, second measurement run             | generated   |
| `thesis-notes/EVAL/Eval_new/*.mendix.json` | Target state read back from Mendix                | generated   |
| `thesis-notes/EVAL/Eval_new/*.sql`         | PostgreSQL DDL for the four test cases            | generated   |

By contrast, `mda-agents/output/*.sql`,
`mda-agents/tests/rent-a-car-pim.json` and
`mda-agents/tests/rent-a-car-pim-from-bus.json` are not version-controlled. These are created anew during
a local run and are excluded in `.gitignore`.

---

## Prerequisites

| Tool                | Version     | Check with         |
| ------------------- | ----------- | ------------------ |
| Node.js             | 18 or later | `node --version`   |
| npm                 | 9 or later  | `npm --version`    |
| Docker with Compose | 24 or later | `docker --version` |

For the Mendix path, access to the Mendix platform is also
required. The access details should be stored in a local file
`mda-agents/.env`, which is deliberately not version-controlled. Use
`mda-agents/.env.example` as a template:

```bash
cp mda-agents/.env.example mda-agents/.env
```

You will need a Personal Access Token with the scope
`mx:modelrepository:repo:write` and the app UUID from the Mendix Developer
Portal. Without these values, all other agents will continue to run; only the
Mendix path will remain inactive.

---

## Quick start

```bash
git clone <repository-url> mda-master-thesis-workspace
cd mda-master-thesis-workspace
cd mda-agents && npm install && cd ..
docker compose up -d
```

This starts six services: the MQTT broker (`eclipse-mosquitto:2`, ports
1883 and 9001), the HTTP entry point `api-server` on port 3001, and the four
transformation agents. A seventh service, the `demo-publisher`, is located in
its own Compose profile and is only started when required.

Check whether the pipeline is ready:

```bash
curl -s http://localhost:3001/health
```

Expected response:

```json
{"status":"ok","service":"api-server","broker":"mqtt-broker:1883"}
```

---

## Running the pipeline

### Option A: via the HTTP interface

The input format is selected via the `X-Input-Format` header. The
`api-server` validates the model against the relevant JSON schema and
publishes it to the bus. From there, everything continues to run in an event-driven manner.

```bash
curl -X POST http://localhost:3001/api/model \
     -H "Content-Type: application/json" \
     -H "X-Input-Format: demo" \
     -d @mda-agents/tests/rent-a-car-demo.json
```

For the MERODE path, use the following:

```bash
curl -X POST http://localhost:3001/api/model \
     -H "Content-Type: application/json" \
     -H "X-Input-Format: merode" \
     -d @mda-agents/tests/rent-a-car-merode.json
```

You can monitor the progress in the logs:

```bash
docker compose logs -f
```

### Option B: locally without a container

Each agent can be started individually. To do this, the broker must be running.

```bash
cd mda-agents
npm run broker:up            # starts the services via Compose
npm run demo-to-pim-agent    # in a separate terminal
npm run pim-to-sql-agent     # in a separate terminal
npm run demo-publisher       # triggers a run
```

The MERODE agent does not yet have its own npm script and is called directly
as follows:

```bash
npx ts-node -r dotenv/config merode-to-pim-agent.ts
```

### Option C: offline tests without a broker

```bash
cd mda-agents
npm run test:transform
```

These tests are hand-written partial reimplementations of the transformation logic
and are no substitute for a complete run via the bus. Further details
can be found in `mda-agents/tests/README.md`.

---

## Verifying the evaluation figures

The artefact figures in `thesis-notes/EVAL/FRAMEWORK.md` do not originate from
the log of the generating agent. They are verified independently: one
script retrieves the target state from the Mendix Team Server, whilst a
second compares it with the input model - that is, with the start of the
chain, rather than with the PIM.

```bash
cd mda-agents
npx ts-node tests/check-mendix-against-input.ts rent-a-car-case-merode
```

The comparison runs offline against the checked-in dumps located at
`thesis-notes/EVAL/Eval_new/`. The script checks entities, attributes (including
type and default value), enumerations (including literals), associations
(including their direction), generalizations, pages and
behaviour artefacts. In addition, the script reports Mendix artefacts that
do not originate from the input model.

You can generate a fresh dump using:

```bash
npx ts-node -r dotenv/config tests/dump-mendix-domain.ts rent-a-car-demo
```

---

## Deployment

The public instance runs on a Raspberry Pi. Two methods are
set up:

- **Automatic:** `.github/workflows/deploy-pi.yml` deploys on every push
  to `main`. For this, a self-hosted GitHub Actions Runner runs on the
  Pi, which fetches the jobs. This means no external port needs to be open.
- **Manual:** `./deploy.sh` fetches the latest state, checks the `.env` file,
  rebuilds the images and, finally, verifies the health endpoint.

The public endpoint `mda.tlolab.com` is served via a Cloudflare
tunnel. The setup is described in `cloudflare-tunnel.md`.

---

## Third-party code and source material

In addition to the author's own code, this repository also contains third-party material. This is
part of the research process and is therefore retained.

**`big-modelling-bus.go.v1/`** is the reference implementation of the BIG
Modelling Bus in Go, module `github.com/erikproper/big-modelling-bus.go.v1`.
Author according to the file headers: Henderik A. Proper, TU Wien. This code is
**not** executed at runtime and is not referenced by any agent. It
served as a template: `mda-agents/bus-client.ts` mirrors its layers 1 to 3
in TypeScript, including the topic pattern. Details can be found in
`big-modelling-bus.go.v1/ATTRIBUTION.md`.

**`thesis-context/`** contains source material for the thesis: the author's own
proposal, model exports and specialist literature. The third-party
publications contained therein are subject to the copyright of their respective publishers and
are included solely as a basis for the work.

---

## Documentation and classification

The introduction to the rule sets is `thesis-notes/MAPPING_NOTES.md`. There,
all four rule sets are compiled with references to the literature and
compared across languages.

The limitations of the prototype are documented in `thesis-notes/LIMITATIONS.md`
and the reasons for them are also explained there. In particular, the prototype is a
feasibility study carried out as part of a Master's thesis and is not a production-ready
tool. Elements that have been deliberately omitted - such as derived attributes
without an OCL equivalent - are marked as justified omissions and
are reported separately by the verification scripts.
