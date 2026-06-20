# Design Decisions (D2)

Architecture documentation for the Modelling Bus. These notes record the decisions made during design and implementation, including what was considered and rejected. The goal is to have enough detail to write the design chapter of the thesis and to answer the inevitable "why didn't you use X instead?" questions from reviewers.

---

## 1. System Overview

The Modelling Bus is a loosely coupled, agent-based MDA pipeline. The core idea — borrowed and extended from Blanc et al. [2] — is to decouple each CIM language's transformation logic into an independent agent that publishes to a shared bus. Any number of agents can coexist. The downstream agent (`pim-to-mendix-agent`) subscribes to PIM artefacts regardless of which upstream agent published them.

The system has three layers:

1. **CIM layer**: format-specific agents that parse CIM models and emit PIM models
2. **Bus layer**: MQTT broker (Eclipse Mosquitto) carrying schema-validated PIM messages
3. **PSM layer**: `pim-to-mendix-agent` that consumes PIM models and writes Mendix SDK calls

What distinguishes this from prior work: Bzowski [4] defined the pimUML vocabulary and the A-rules theoretically, but never automated the pipeline. Krouwel et al. [11] automated a pipeline but hardcoded DEMO as the only input and had no explicit PIM. This thesis automates Bzowski's pipeline and extends it to multiple input languages by making the PIM the contract between the layers.

---

## 2. Decision Log

### DD1 — MQTT as the message bus

**Decision:** Use Eclipse Mosquitto (MQTT 3.1.1) as the broker.

**Context:** The system needs to decouple agents in time and location. Several messaging approaches were considered.

**Options:**
- *REST/HTTP*: Synchronous, tightly coupled. Agent B would need to know Agent A's address. Fails AR6 (loose coupling). Rejected.
- *Shared database*: A central database where agents write/read model states. More coupling, harder to run independently. Rejected.
- *Apache Kafka*: More powerful but heavyweight for a research prototype. Requires more infrastructure. The consumer group model doesn't add value here since we don't need partitioning. Rejected as overkill.
- *MQTT*: Lightweight, publish/subscribe, well-suited for IoT and distributed agent architectures. Eclipse Mosquitto is free and runs trivially in Docker. The retained message feature is particularly useful: any agent that connects receives the latest state of each topic immediately, without waiting for a new publication. This means agents can be restarted during development without losing the bus state.

**Verdict:** MQTT is the right choice for this prototype. The retained message semantics give the bus a "memory" that makes development and debugging significantly easier. The publish/subscribe model naturally enforces the decoupling required by AR2.

**Limitation:** MQTT does not provide guaranteed delivery ordering across topics, and the broker is a single point of failure. Both are acceptable for a research prototype.

### DD2 — JSON Schema as the PIM meta-language

**Decision:** Represent the pimUML PIM as a JSON Schema-validated JSON document.

**Context:** Bzowski [4] defined pimUML as a UML profile. To automate the pipeline, a concrete serialisation format is needed. The proposal explicitly references Colantoni et al. [5], who demonstrate that JSON Schema can be used as a meta-language for MDE artefacts.

**Options:**
- *XMI (XML Metadata Interchange)*: Standard format for UML models, used by Eclipse EMF. But it requires a heavy toolchain (Eclipse, Ecore metamodels) and is verbose. The Mendix SDK is TypeScript-based and JSON-native, making XMI an impedance mismatch. Rejected.
- *YAML*: Human-readable alternative to JSON. Less tooling support for schema validation. No benefit over JSON for this use case. Rejected.
- *Plain TypeScript objects*: Could define the PIM as TypeScript interfaces only. Loses the language-independence and the ability to validate schema compliance programmatically. Rejected.
- *JSON Schema*: JSON is native to the Mendix SDK, natively transported over MQTT, and directly validatable with AJV. JSON Schema's `additionalProperties: false` enforcement is exactly what we need to prevent silent schema drift. Already used by Bzowski as a design choice. Adopted.

**Note on schema strictness:** All schemas use `additionalProperties: false`. This is intentional. Without it, an agent could add fields that the schema doesn't define and no one would notice until something downstream broke silently. Strict schemas make schema evolution explicit and catch bugs early.

### DD3 — pimUML as the PIM language

**Decision:** Use Bzowski's pimUML as the starting point for the PIM.

**Context:** The thesis builds directly on Bzowski [4]. He defined the A-rules from DEMO Fact Model to pimUML and the B-rules from pimUML to Mendix. My job is to (a) automate these rules and (b) extend pimUML to cover MERODE.

**Why not define a new PIM?** Defining a new PIM from scratch would be a much larger contribution but would also require justifying every design decision independently. Building on Bzowski grounds the PIM in prior academic work and lets me focus the thesis contribution on the automation and extension rather than the PIM design itself. The contribution is the *pipeline architecture* and the *MERODE extension*, not the PIM language.

**What pimUML covers:** Three UML diagram types — class diagram (structural), state machine diagram (behavioural), and activity diagram (operations). For the prototype, the class and state machine diagrams are fully used; the activity diagram is partially used (activities are recorded as typed objects in the PIM but not rendered as full UML activity diagrams).

### DD4 — Sequential FSM for MERODE lifecycles (Option B)

**Decision:** Represent MERODE object lifecycles as sequential state machines with named, ordered states and a final state — not as orthogonal boolean regions (which is what DEMO produces).

**Context:** This was the most consequential design decision in the MERODE extension. Three options existed:

**Option A — reuse DEMO's boolean-region encoding.** Represent each business event type as an orthogonal region with `false`/`true` states, regardless of whether the source is DEMO or MERODE. Maximum schema reuse, zero PIM extension needed. But semantically wrong. A MERODE object's lifecycle states are mutually exclusive (an object is either `active` or `completed`, never both), but boolean regions represent independent flags that can be in any combination. Using Option A would produce structurally invalid models of MERODE lifecycles. The thesis would not be able to claim semantic correctness for MERODE. Rejected on semantic grounds.

**Option B — sequential state machine with named states.** One region, one initial pseudostate, named lifecycle states (kind: `simple`), one final state. This is how Snoeck [21] describes MERODE FSMs in Chapter 6: "life cycle states are successive phases of the object's life" (p. 127). Requires extending `State.kind` and making `Region.forEvent` optional. Cost is real but the benefit is semantic fidelity. **Adopted.**

**Option C — NotMapped.** Simply don't map MERODE FSMs at all, document them as out of scope. This would preserve the "no schema change" extensibility result but would mean the thesis can only claim structural transformation (classes, attributes, associations) for MERODE, not behavioural transformation. This would undermine the heterogeneity claim of the thesis. Rejected.

**Verdict:** Option B is the only defensible choice given the thesis's claims. The fact that it forces a minimal PIM extension is *itself* a finding: the pimUML schema designed for DEMO is nearly but not completely sufficient for MERODE. Documenting exactly what had to change and why is a contribution to the understanding of what a "shared PIM" for heterogeneous enterprise models must support.

### DD5 — Additive, backward-compatible PIM schema extension

**Decision:** Extend `pimuml-schema.json` in the minimal way required for MERODE, ensuring all DEMO-generated PIM instances continue to validate without any changes to the DEMO agent.

**Changes made:**
1. `State.kind` extended from `["initial","false","true"]` to `["initial","false","true","simple","final"]`
   — DEMO states use only `initial`, `false`, `true`. MERODE states use `initial`, `simple`, `final`. No conflict.

2. `Activity.kind` extended from `["set","create"]` to `["set","create","end"]`
   — DEMO activities are only `create` and `set`. MERODE adds `end` for ending events (M8). DEMO agents produce no `end` activities, so adding the value doesn't affect their output.

3. `Region.forEvent` made optional (previously implicitly required because all DEMO regions always set it)
   — MERODE regions don't have a `forEvent` annotation (there is no event-per-region structure in a sequential FSM). Making it optional allows MERODE regions to validate while DEMO regions continue to set it as before.

These are the minimal changes. The spirit of the extension is: add exactly what MERODE needs, change nothing that DEMO uses. The only debatable point is (3): one could argue that making `forEvent` optional is not purely additive since it relaxes a constraint. In practice, no DEMO-generated PIM would fail if this is made optional — they all set it. But conceptually it is a relaxation. I document this in LIMITATIONS.md.

### DD6 — `isMerodeFSM()` distinguisher in the PSM agent

**Decision:** The `pim-to-mendix-agent` uses a helper function `isMerodeFSM(sm)` to distinguish MERODE-style from DEMO-style state machines and apply different B-rules accordingly.

**Context:** When the PIM arrives at the Mendix agent, it no longer carries metadata about which CIM language produced it. But the B-rules for DEMO FSMs (B11–B12: Workflow generation) and MERODE FSMs (B13–B16: status enum + microflows) are different. The agent needs to dispatch to the right set of rules.

**The distinguisher:** `isMerodeFSM` returns `true` if all regions in the state machine have no `forEvent` annotation. DEMO FSMs always set `forEvent` on every region (one region per event). MERODE FSMs never do (one region per object type, no event annotation). This is a structural property of the PIM encoding, not an explicit language tag.

**Why not add an explicit `sourceLanguage` tag to the PIM?** That would violate AR2 (language isolation). The PIM is supposed to be a language-independent intermediate format. Adding `sourceLanguage: "merode"` to the PIM would mean the downstream agent knows which CIM language produced the model, which couples the downstream to upstream language choices. Using a structural property of the PIM encoding as the distinguisher keeps the language isolation intact — the downstream only sees pimUML, not "MERODE-flavoured pimUML".

**Trade-off:** This approach is clever but fragile if a third language uses a similar FSM structure. Documented in LIMITATIONS.md. For the current scope (DEMO + MERODE), the discriminator is unambiguous.

### DD7 — TypeScript/Node.js for all agents

**Decision:** All agents are TypeScript on Node.js.

**Rationale:**
- The Mendix Platform SDK is TypeScript-native. Using TypeScript for the agent that calls the SDK is the only practical choice given the current SDK documentation and community.
- Using the same language for all agents reduces cognitive overhead and allows sharing utility code (`bus-client.ts`, `agent-utils.ts`, `schemas/types.ts`).
- Bzowski [4] used TypeScript for his (manual) transformations. Using the same language makes the connection to prior work more direct.
- JSON Schema validation with AJV is excellent in the TypeScript ecosystem.

**Considered and rejected:** Python (good NLP/AI libraries but no Mendix SDK), Java (verbose, no Mendix SDK), Go (no Mendix SDK). The Mendix SDK dependency effectively mandates TypeScript.

### DD8 — Docker Compose for deployment

**Decision:** All services (MQTT broker, API server, agents) run as Docker containers, orchestrated by Docker Compose on a Raspberry Pi 4.

**Rationale:** The deployment target (Raspberry Pi) is a fixed constraint. Docker Compose gives a reproducible, version-controlled deployment configuration. Adding a new agent means adding a service block in `docker-compose.yml` — this is another concrete indicator of what "adding a new language" costs.

**Raspberry Pi choice:** Running on a Pi rather than a cloud VM demonstrates that the system is lightweight and doesn't require heavy infrastructure. It also makes the system more interesting as a demonstration (it's running on a €60 board with a public URL, not on an enterprise server).

### DD9 — Retained MQTT messages

**Decision:** All published artefacts use the MQTT `retain: true` flag.

**Why this matters:** Without retained messages, an agent that connects after a publication would receive nothing and would not know the current state of the bus. Retained messages make the broker act as a persistent state store. This means:
- A freshly started `pim-to-mendix-agent` immediately receives the latest PIM for each artefact without waiting for someone to republish
- During development, I can restart a single agent and it immediately re-processes the latest model
- The "bus" has memory, which is semantically important: the bus is supposed to represent the current agreed-upon state of each artefact, not just a transient communication channel

### DD10 — `X-Input-Format` header for language selection

**Decision:** The API server dispatches to the correct CIM schema validator and MQTT topic based on an `X-Input-Format` header (`demo` or `merode`).

**Context:** A single `/api/model` endpoint receives all models. The API server needs to know which CIM language the submitted model is in to validate it and publish it on the right MQTT topic.

**Alternative:** Autodetect the language from the model structure. Rejected because it introduces fragility — two languages might share some structural elements, making autodetection unreliable. An explicit header is simpler and clearer.

### DD11 — Shared `PIM_SOURCE_AGENTS` subscription in the Mendix agent

**Decision:** The `pim-to-mendix-agent` subscribes to PIM artefacts from *all* CIM agents, not just the DEMO agent.

**Context:** The original prototype hardcoded `SOURCE_AGENT_ID = "demo-to-pim-agent"`. When MERODE was added, the Mendix agent received MERODE PIM models but ignored them because it was only subscribed to the DEMO agent's topic.

**Fix:** Use an environment variable `PIM_PUBLISHER_AGENT_IDS` (defaulting to `"demo-to-pim-agent,merode-to-pim-agent"`) and subscribe to all listed agent IDs at startup. This is a minor change to the Mendix agent but it is a change, and it's worth documenting because it shows that the "no change to existing components" claim requires nuance — see EXTENSIBILITY_EVIDENCE.md.

---

## 3. Decisions That Are Implementation Details (Not Architectural)

Some decisions were pragmatic and don't need thesis-level justification, but I record them here for completeness:

- **`${ot.name}ID` not `id` for the logical identifier**: Mendix reserves `id` as a system field. Using the object type name as a prefix avoids this collision (CE7247).
- **No quotes around enum literals in microflow expressions**: Mendix microflow expressions reference enum values as `Module.Enum.Value`, not `'Module.Enum.Value'`. This caused CE0117 and took some debugging.
- **English captions for enum values**: The Mendix SDK requires at least one language caption for each enumeration value. An empty caption causes CW0263. The agent adds an English caption automatically by capitalising the first letter of the value name.
- **Workflow generation skipped for MERODE**: Generating Mendix Workflows for MERODE sequential FSMs is possible in principle but requires mapping lifecycle states to Workflow activities, which is significantly more complex than the status-attribute approach (B13–B16). The stub implementation uses microflows only. This is documented as a limitation.
