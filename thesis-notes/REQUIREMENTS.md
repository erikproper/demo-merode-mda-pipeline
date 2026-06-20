# Requirements Catalogue (D1)

Working notes for the requirements chapter. These are derived from the proposal (RQ1–RQ4, Section 2.3), from experience building the prototype, and from the two source languages (DEMO and MERODE). The target audience for these notes is me writing Chapter X of the thesis — so the goal here is to record not just what the requirements are but why they are what they are and where I can point to literature support.

---

## 1. Where the Requirements Come From

The research follows Design Science Research (Hevner et al. [7], Peffers et al. [18]), which means the requirements must be grounded in a literature gap before any artefact gets designed. The gap is identified in RQ1 via a Systematic Mapping Study: all known MDA pipelines for enterprise modelling languages are monolithic and tied to a single CIM input language. Adding a second language requires rewriting the whole chain.

The requirements below therefore divide into two groups:

- **Architectural requirements (AR)** — properties the Modelling Bus as a system must satisfy
- **PIM structural requirements (PR)** — properties the intermediate model format must have to serve as a common target for paradigmatically different source languages

Both groups are also constrained by the success criteria in Section 2.3 of the proposal, which operationalise them as measurable metrics (semantic completeness, semantic validity, schema validation rate, traceability coverage, extensibility).

---

## 2. Architectural Requirements

### AR1 — Multi-language CIM input

The system must accept models from at least two paradigmatically different CIM languages. "Paradigmatically different" matters here: the thesis explicitly needs DEMO and MERODE because they represent fundamentally different approaches to enterprise modelling. DEMO (Dietz and Mulder [6]) is fact-oriented and based on PSI theory and Enterprise Ontology. MERODE (Snoeck [21]) is object-lifecycle-oriented, centred on existence dependencies and finite-state machines. A system that handles two dialects of the same paradigm would not demonstrate the same extensibility claim.

The current implementation supports both via separate agents: `demo-to-pim-agent` and `merode-to-pim-agent`. The agent architecture is what makes this possible without coupling the two language parsers to each other.

### AR2 — Language isolation

The transformation logic for each CIM language must be contained within exactly one agent. No CIM-specific knowledge may appear outside that agent. In practice this means:

- The MQTT bus carries only schema-validated PIM messages, never raw CIM data
- The `pim-to-mendix-agent` may not contain any DEMO- or MERODE-specific logic for *parsing* the source; it may contain language-specific logic only for interpreting PIM concepts that were introduced to accommodate a given language (see DD6 in DESIGN_DECISIONS.md)
- The `demo-to-pim-agent` is completely ignorant of MERODE and vice versa

This requirement is what the extensibility experiment (E1–E2) will validate. If a third agent can be plugged in without changes to existing agents or the bus infrastructure, AR2 is satisfied.

### AR3 — Additive extensibility (the key claim)

Adding support for a new CIM language must require no changes to existing components. This is the central thesis claim and is operationalised as a binary yes/no criterion in Section 2.3 of the proposal, following ISO/IEC 25010 [8] modifiability.

"Existing components" means: `bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts` (insofar as its core pipeline logic is concerned), and `pimuml-schema.json` (insofar as existing DEMO-derived fields still validate without change).

In practice, when MERODE was added: no existing agent file was modified in its core transformation logic. The `pim-to-mendix-agent.ts` received additional B-rules (B13–B16) and the `isMerodeFSM()` helper, but the DEMO path through it remained byte-for-byte identical in behaviour. The PIM schema was extended additively (new enum values, one field made optional). Whether this satisfies AR3 strictly or represents a partial violation is discussed in EXTENSIBILITY_EVIDENCE.md.

### AR4 — Schema-validated intermediate format

Every PIM instance published on the bus must pass JSON Schema validation before being consumed by the downstream agent. The schema must use `additionalProperties: false` to prevent silent field drift. The metric is the Schema Validation Rate (SVR), which must equal 100% for the pipeline to be considered structurally sound.

The implementation validates input models against their CIM schema and output PIM models against `pimuml-schema.json` before publishing. Any validation error aborts the transformation with a logged error and does not publish.

### AR5 — End-to-end automation

No manual step is permitted between CIM model input and Mendix app output. The pipeline is triggered by a single HTTP POST to `/api/model` with the model JSON in the body. Everything downstream — MQTT publish, agent subscription, PIM transformation, Mendix SDK calls — happens automatically. This distinguishes the system from Bzowski [4], whose transformation was demonstrated manually.

### AR6 — Loose coupling via asynchronous messaging

Agents must be decoupled in time and location. The MQTT broker (Eclipse Mosquitto) is the only shared dependency. Agents can be started, stopped, and restarted independently. Retained messages on the broker mean a restarted agent immediately receives the latest state of any artefact it cares about, without having to wait for a new publication. This is important for resilience during development and testing.

### AR7 — Traceability

Every source concept that enters the pipeline must have a documented trace link to its target concept(s) in the PIM. The `TraceEntry[]` array attached to each published PIM message records these mappings. The metric is Traceability Coverage, defined after Winkler and Pilgrim [25]: the proportion of source elements with at least one documented trace link in the output model.

Auxiliary structures (like the `__initial` and `__final` pseudostates added by the FSM construction) count as "added" elements and are allowed per the tolerance defined in Section 2.3 of the proposal, since they have no direct semantic counterpart in the source model but are structurally necessary in the target.

---

## 3. PIM Structural Requirements

The PIM is the central design challenge of the thesis. It must be expressive enough to capture concepts from both DEMO and MERODE without being so specific to either that it needs a complete rewrite when the other is added.

### PR1 — Structural expressiveness (classes, attributes, associations)

This is the easy part. Both DEMO and MERODE describe business objects with attributes and relationships. pimUML already covers this via Class, Property, and Association. The DEMO rules A3, A5, A11–A12 and the MERODE rules M1, M2, M4 all map to the same pimUML structural constructs. This is the point where the two languages overlap — what Snoeck calls the "data model" view (EDG) is structurally comparable to the DEMO Fact Model.

### PR2 — Behavioural expressiveness (lifecycle FSMs)

This is where the languages diverge. DEMO and MERODE both use finite-state machines to describe object lifecycles, but the FSMs are structurally and semantically very different.

DEMO FSMs (from Bzowski, A6) consist of orthogonal regions, one per event type. Each region holds exactly two states: `false` (event not yet occurred) and `true` (event occurred). The regions are independent and can be in any combination of states simultaneously. Events are monotonic — once true, always true.

MERODE FSMs (Snoeck [21], Chapter 6) consist of a single sequential region with named, mutually exclusive lifecycle states. Events are not monotonic: an object moves from one named state to the next, and ending events move it to a final state after which no further events apply.

The PIM must accommodate both. The solution adopted here is to use a single `StateMachine` with `Region` elements, where:
- DEMO regions are annotated with `forEvent` (one region per event, boolean pair)
- MERODE regions have no `forEvent` (one region total, sequential named states)

This encoding requires extending `State.kind` beyond Bzowski's `{initial, false, true}` to include `simple` and `final`. It also requires making `Region.forEvent` optional (it was implicitly required in the DEMO context). These are the minimal schema changes documented in DD5 (DESIGN_DECISIONS.md).

### PR3 — Activity kinds

Transformation rules produce different kinds of activities depending on the source language. DEMO produces `create` and `set` activities. MERODE additionally needs `end` activities for ending events (M8). The `Activity.kind` field was extended from `{set, create}` to `{set, create, end}` to accommodate this.

### PR4 — JSON serialisability

The PIM must be serialisable as JSON and describable by a JSON Schema. This is required for schema validation (AR4) and for MQTT transport. The pimUML JSON schema (`pimuml-schema.json`) is the normative definition of the PIM.

### PR5 — Backward compatibility under extension

Any extension to the PIM schema for MERODE support must not break existing DEMO-generated PIM instances. This means:
- New fields must be optional
- New enum values must not conflict with existing ones
- Existing required fields must remain required

All three schema changes made for MERODE (State.kind extension, Activity.kind extension, Region.forEvent made optional) satisfy this requirement. A DEMO-generated PIM still validates against the updated schema without any changes to the DEMO agent.

---

## 4. Quality Requirements (from Proposal Section 2.3)

These are the operationalised success criteria that the evaluation (D6, D7) will assess.

### QR1 — Semantic Completeness

Proportion of source facts correctly retained in the target model. A source fact is "retained" if it appears in the PIM with the correct type and the correct relationships to other elements. For DEMO, source facts are: entity types, fact types, property types, cardinalities, and derivation rules. For MERODE: object types, existence dependencies, business event types, and finite-state machines (per proposal Section 3.3).

The four-way classification used is: Correct / Missing / Incorrect / Added. Completeness = Correct / (Correct + Missing + Incorrect).

### QR2 — Semantic Validity

Absence of incorrectly transformed or unjustifiably added elements. Validity = Correct / (Correct + Incorrect + Added_unjustified). Note: structurally necessary auxiliary elements (like `__initial` pseudostates) count as "Added_justified" and are excluded from the validity penalty.

### QR3 — Schema Validation Rate (SVR)

Must equal 100%. A single schema validation failure means the pipeline is structurally broken. This is a hard constraint, not a quality metric to be optimised.

### QR4 — Traceability Coverage

Proportion of source elements with at least one trace link. Target: 100% for elements that have a semantic counterpart. Elements explicitly documented as NotMapped (e.g. M9 propagated events) are excluded from the denominator.

### QR5 — Extensibility

Binary criterion. A third CIM agent can be integrated without modifying any existing component. This is operationalised as: does adding the third agent require changes to `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts`, or `pimuml-schema.json` (beyond additive changes)? If not, the criterion is satisfied.

---

## 5. Non-Functional Requirements

- **NFR1** — The system must run on commodity hardware (Raspberry Pi 4). All agents must operate within reasonable memory constraints.
- **NFR2** — Transformation latency is not a formal requirement, but the end-to-end time from HTTP POST to Mendix model update should be measurable in seconds, not minutes, for the case study model sizes.
- **NFR3** — The schemas must be machine-readable (JSON Schema draft-07) so that validation can be automated in CI.

---

## 6. Requirements Not In Scope

The following requirements would be relevant for a production system but are explicitly out of scope for this thesis:

- Security: authentication, authorisation, TLS for MQTT (the current deployment uses plain text MQTT, acceptable for a research prototype)
- Scalability: concurrent model submissions, load balancing
- Error recovery: if an agent crashes mid-transformation, there is no rollback mechanism
- Mendix platform versioning: the prototype targets a specific SDK version; future SDK changes are not handled
- Round-trip engineering: transforming Mendix models back to CIM (reverse direction is out of scope)
