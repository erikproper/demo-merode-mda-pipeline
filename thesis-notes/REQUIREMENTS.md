# Requirements Catalog (D1)

Working document on the requirements for the Modeling Bus. These requirements are derived from the proposal (listed there as RQ1-RQ4, Section 2.3), from experience gained during the development of the prototype, and from the analysis of both source languages. Here, I not only document what is required, but also why, and where the relevant references can be found.

---

## 1. Origin of the Requirements

The research follows the Design Science Research approach (Hevner et al. [7], Peffers et al. [18]). This means that requirements must be derived from an identified research gap before an artifact is designed. The gap was identified in RQ1 via a systematic mapping study: all known MDA pipelines for enterprise modeling languages are monolithic and tailored to exactly one CIM input language. Adding a second language requires a complete rewrite of the pipeline.

The requirements are accordingly divided into two groups. Architecture requirements (AR) describe which system properties the Modeling Bus must fulfill. PIM structural requirements (PR) specify what the intermediate model format must achieve in order to serve as a common target for paradigmatically different source languages. Both groups are operationalized by the success criteria from Section 2.3 of the proposal.

---

## 2. Architectural Requirements

### AR1 - Multilingual CIM Input

The system must accept models from at least two paradigmatically different CIM languages. The word "paradigmatic" is crucial here: this thesis explicitly requires DEMO and MERODE because they represent fundamentally different approaches to enterprise modeling. DEMO (Dietz and Mulder [6]) is fact-based and grounded in PSI theory and enterprise ontology. MERODE (Snoeck [21]) is object-lifecycle-oriented and centers on existence dependencies and finite automata. A system that processes only two dialects of the same school of thought would not demonstrate extensibility.

In the current prototype, both languages are implemented via separate agents: `demo-to-pim-agent` and `merode-to-pim-agent`. It is this agent architecture that prevents the two language parsers from being coupled to one another.

### AR2 - Language Isolation

The transformation logic for each CIM language must be encapsulated in exactly one agent. No CIM-specific knowledge may appear outside of this agent. Specifically, this means: the MQTT bus carries only schema-validated PIM messages, never raw CIM data. The `pim-to-mendix-agent` must not contain any parsing logic for DEMO or MERODE. And the `demo-to-pim-agent` is completely unaware of MERODE, and vice versa.

The extensibility experiment empirically verifies this requirement: the `pim-to-sql-agent` (S1-S12) was built as a third, independent PSM agent without requiring any changes to `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts`, or the bus infrastructure (evidence provided via a diff table in `EXTENSIBILITY_EVIDENCE.md`, §5). Thus, AR2 is satisfied.

### AR3 - Additive Extensibility

Adding a new CIM language must not require any changes to existing components. This is the central claim of the thesis and is operationalized in Section 2.3 of the proposal as a binary criterion according to ISO/IEC 25010 [8].

Specifically, "existing components" are: `bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts` in its core logic, and `pimuml-schema.json`, provided that existing DEMO-generated fields remain valid. When MERODE was added, no existing agent's transformation logic was modified. The `pim-to-mendix-agent.ts` file was given additional B-rules (B13-B16), but the DEMO path through this agent remained behaviorally identical. Subsequent bug fixes to the DEMO path (B11/B12, 2026-09-14) are separate from this and are not a result of the MERODE integration. A detailed discussion of this distinction can be found in EXTENSIBILITY_EVIDENCE.md.

### AR4 - Schema-Validated Intermediate Format

Every PIM instance on the bus must pass a JSON schema validation before further processing. The schema uses `additionalProperties: false` to prevent silent divergence in the field structure. The metric for this is the Schema Validation Rate (SVR), which must be 100% for a structurally correct pipeline.

The prototype validates input models against their CIM schema and output PIM models against `pimuml-schema.json` before publication. A validation error aborts the transformation with an error message and does not publish anything.

### AR5 - Full Automation

No manual steps should occur between the CIM model input and the Mendix app output. The pipeline is triggered by a single HTTP POST to `/api/model`. Everything that follows happens automatically. This distinguishes the prototype from Bzowski [4], whose transformation was demonstrated manually.

### AR6 - Loose Coupling via Asynchronous Messaging

Agents must be decoupled in terms of time and location. The MQTT broker is the only shared dependency. Agents can be started, stopped, and restarted independently. MQTT's retained message feature ensures that a restarted agent immediately receives the last known state of each artifact without having to wait for a new publication. This is particularly valuable during development and testing.

### AR7 - Traceability

Every source concept that enters the pipeline must have a documented trace link to its target concepts in the PIM. The `TraceEntry[]` array in every published PIM message records these mappings. The metric is traceability coverage as defined by Winkler and Pilgrim [25]: the proportion of source elements with at least one documented trace link in the output model.

Auxiliary structures such as the `__initial` and `__final` pseudo-states, which arise during FSM construction, are classified as "Added_justified" and are permitted according to the tolerance definitions in Section 2.3 of the proposal because they have no direct semantic counterpart in the source model but are structurally necessary.

---

## 3. PIM Structural Requirements

The PIM is the central design challenge of this thesis. It must be expressive enough to capture concepts from both DEMO and MERODE without being so specific to either language that it requires a complete overhaul when the other language is added.

### PR1 - Structural Expressiveness

This is the straightforward part. Both languages describe business objects using attributes and relationships. pimUML already covers this through Class, Property, and Association. The DEMO rules A3, A5, A11-A12 and the MERODE rules M1, M2, M4 all map to the same pimUML structural constructs. This is the area of overlap between the two languages: what Snoeck refers to as the "data model view" (EDG) is structurally comparable to the DEMO Fact Model.

### PR2 - Behavioral Expressiveness (Life Cycle FSMs)

This is where the languages diverge. DEMO and MERODE both use finite state machines for object life cycles, but these FSMs differ fundamentally.

DEMO FSMs (Bzowski, A6) consist of orthogonal regions, one per event type. Each region has exactly two states: `false` (event has not yet occurred) and `true` (event has occurred). The regions are independent of one another and can be active in any combination. Events are monotonic and cannot be undone.

MERODE FSMs (Snoeck [21], Chapter 6) consist of a single sequential region with named, mutually exclusive lifecycle states. An object moves from one state to the next. Termination events lead to a final state, after which no further events are possible.

The PIM must support both. The chosen solution uses a single `StateMachine` with `Region` elements, where DEMO regions have a `forEvent` attribute (one region per event, Boolean pair) and MERODE regions do not (one region per object type, sequential named states). This requires extending `State.kind` to include `simple` and `final`, as well as making `Region.forEvent` optional. These changes are documented in DD5 (DESIGN_DECISIONS.md).

### PR3 - Activity Types

Different transformation rules generate different activity types. DEMO generates `create` and `set` activities. MERODE additionally requires `end` activities for termination events (M8). The `Activity.kind` field has been expanded accordingly from `{set, create}` to `{set, create, end}`.

### PR4 - JSON Serializability

The PIM must be serializable as JSON and describable by a JSON schema. This is a prerequisite for schema validation (AR4) and MQTT transport. The pimUML JSON schema (`pimuml-schema.json`) is the normative definition of the PIM.

### PR5 - Backward Compatibility for Extensions

Any schema extension for MERODE must not invalidate existing DEMO-generated PIM instances. New fields must be optional, new enum values must not conflict with existing ones, and existing required fields must remain required. All three schema changes made for MERODE meet this condition. A DEMO-generated PIM validates against the extended schema without any changes to the DEMO agent.

---

## 4. Quality Requirements (from the Proposal, Section 2.3)

These are the operationalized success criteria that the evaluation (D6, D7) assesses.

### QR1 - Semantic Completeness

The proportion of source statements that are correctly mapped to the target model. A source statement is considered "preserved" if it appears in the PIM with the correct type and the correct relationships to other elements. For DEMO, source statements are: entity types, fact types, property types, cardinalities, and derivation rules. For MERODE: object types, existence dependencies, business event types, and finite automata (as per the proposal, Section 3.3).

The four-class classification used is: Correct, Missing, Incorrect, Added. Completeness is calculated as C / (C + M + I).

### QR2 - Semantic Validity

Absence of incorrectly transformed or unjustifiably added elements. Validity = C / (C + I + Added_unjustified). Structurally necessary auxiliary elements such as `__initial` pseudo-states count as "Added_justified" and are not considered errors.

### QR3 - Schema Validation Rate (SVR)

Must be 100%. A single validation error means that the pipeline is structurally defective. This is not a metric to be optimized, but a hard requirement.

### QR4 - Traceability Coverage

Percentage of source elements with at least one trace link. Target value: 100% for all elements that have a semantic counterpart. Elements explicitly documented as NotMapped (e.g., events propagated by M9) are excluded from the denominator.

### QR5 - Extensibility

Binary criterion. A third CIM agent can be integrated without modifying existing components. Operationalized as: Do `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts`, or `pimuml-schema.json` need to be modified? If not (aside from additive changes), the criterion is met.

---

## 5. Non-Functional Requirements

The system must be capable of running on consumer hardware (Raspberry Pi 4). All agents must operate within reasonable memory constraints.

There is no formal requirement regarding transformation latency, but the turnaround time from the HTTP POST request to the Mendix model update should be in the range of seconds, not minutes, for case study-sized models.

The schemas must be machine-readable (JSON Schema Draft-07) so that validation can be automated in CI.

---

## 6. Deliberately Out of Scope

The following requirements would be relevant for a production system but are explicitly outside the scope of this thesis: security (authentication, authorization, TLS for MQTT), scalability for concurrent model submissions, fault recovery in case of agent crashes during transformation, Mendix platform versioning, and reverse engineering (Mendix models back to CIM).
