# Limitations and Scope Decisions

These notes document what the prototype does not do and why. For the thesis, this material goes into a Limitations section and a Future Work section — the distinction being: a limitation is something the system cannot do within the defined scope, while future work is something outside the defined scope that would be a natural next step.

The tone in the thesis should be honest and analytical: every limitation should come with a justification (why it's acceptable) and ideally a brief indication of what it would take to address it. Reviewers appreciate this — it shows I understand the boundaries of the work.

---

## 1. M-Rule Gaps

### M3 — Attribute domains not modelled

**What's missing:** When a MERODE attribute has an enumerated domain (e.g., `carGroup: {economy, standard, luxury}`) or a user-defined scalar domain, the current implementation treats it as a plain `String` attribute. No pimUML Enumeration or DataType is generated for the domain.

**Why it's missing:** The `merode-schema.json` defines attribute type as a plain string (`"type": { "type": "string" }`). There is no mechanism in the schema to specify that a type name refers to an enumerated domain with a given set of values. Supporting M3 would require either:
1. Adding a `domains` array to the MERODE schema (like DEMO's `valueTypes`), or
2. Allowing attributes to carry inline enum definitions

Both are possible but were deferred in favour of getting M5–M8 working first.

**Impact on evaluation:** Any MERODE model that uses enumerated attribute domains will have those attributes as Missing in the semantic completeness assessment (the domain information is dropped). For the Rent-A-Car fixture (which has only String attributes), there is no impact.

**Fix estimate:** Medium effort. Extend `merode-schema.json` with a `domainTypes` array, extend `types.ts` with a `MerodeDomainType` interface, add domain processing in `merode-to-pim-agent.ts`. The pimUML schema already supports Enumeration and DataType.

### M9 — Shared event participation and propagation not implemented

**What's missing:** In MERODE, business events are shared across multiple object types. The Propagation Rule (Snoeck, Ch. 5.3.1, p. 114) states that when an event involves a dependent object type, it automatically also involves all master object types (with type M). For example, `startRental` involves Rental (O/C), Car (A/M), and Person (A/M).

The current implementation only handles the owner participation — the `role` field on a BusinessEventType corresponds to the owner's C/M/E in the OET. The propagated A/M participations of master object types are not processed.

**Why it's missing:** Implementing M9 correctly requires:
1. Building a propagation closure from the EDG (traverse all existence dependencies transitively)
2. For each event that involves a dependent, finding all master object types reachable via the dependency chain
3. Adding M-role transitions in the master object types' FSMs for each propagated event
4. Handling the case where an event propagates to multiple levels of masters

This is non-trivial and the test fixture only models owner participations explicitly. I decided to treat M9 as Future Work and focus on getting M1–M8 correct first.

**Impact on evaluation:** Significant. The OET is only partially captured. For the Rent-A-Car case, `startRental` and `completeRental` should also appear as modifying events in Car and Person — but they don't in the current output. These will be Missing elements in the semantic completeness evaluation.

**Significance for the thesis:** M9 is arguably the most interesting rule from a research perspective — it's the rule with the least DEMO analogue and the one that most clearly shows MERODE's paradigmatic difference. The formal specification of M9 should appear in the thesis even though the implementation is incomplete. The honest framing is: "The rule is formally defined and its implementation would require X and Y; it is left for future work due to time constraints."

---

## 2. B-Rule Gaps

### B16 — End microflow is a stub

**What's missing:** The `End_<Entity>` microflow is generated with only a parameter node. It does not implement any actual end behaviour: no deletion, no archival, no status change.

**Why:** How an object should be "ended" in Mendix is an application-level decision, not a model-level one. Options include:
- Setting `status = final` (if using the status attribute from B13)
- Soft-deleting: setting a `deletedAt` timestamp attribute and filtering queries
- Hard-deleting: calling `DeleteObjectAction`
- Archiving: moving to a separate entity or table

The right choice depends on the application requirements. The pimUML `end` activity kind doesn't prescribe any of these. For the prototype, generating a non-empty stub that at minimum takes the object as a parameter is sufficient to demonstrate the B16 rule exists.

**Fix estimate:** Low effort once the design decision (hard-delete vs. soft-delete) is made. Add a `DeleteObjectAction` or a `MemberChange` for a `deletedAt` field.

### Workflow generation for MERODE is skipped

**What's missing:** The DEMO pipeline generates a Mendix Workflow (with WaitForNotification activities) for each entity type's FSM. The MERODE pipeline does not. The `isMerodeFSM()` check in the `pim-to-mendix-agent` skips workflow generation for MERODE state machines.

**Why:** Mendix Workflows are designed for long-running processes with human interaction points (WaitForNotification). They map well to DEMO's boolean-region FSMs because each region can become a Workflow wait activity (waiting for the event to occur). MERODE's sequential FSMs don't map as cleanly to Mendix Workflows: the lifecycle states would become Workflow activities, but the trigger/transition structure is different.

More concretely: when the workflow generator encountered a MERODE FSM, it tried to create a `WaitForNotification` activity named `Wait_<forEvent>`, but MERODE regions have no `forEvent` — the name came out as `Wait_undefined`. This was the bug that motivated the `isMerodeFSM()` skip.

**Potential approach:** Map each lifecycle state to a Workflow activity type (user task or automated task) and each transition to the progression logic. This would require new B-rule definitions and is left as future work.

---

## 3. MERODE Concept Coverage

The following MERODE concepts from Snoeck [21] are explicitly out of scope:

### Inheritance (Chapter 8)

Snoeck devotes a full chapter to inheritance in MERODE. Object types can be specialised based on attributes (attribute-defined subclass), existence (existence-defined subclass), or state (state-defined subclass). Each form has different implications for event participation and lifecycle modelling.

The current implementation does not handle inheritance. No `generalizations` field is produced in the MERODE pimUML output. The pimUML schema supports Generalization (B10 exists in the B-rules), so implementing it would primarily require extending the MERODE schema and agent.

**Justification for exclusion:** The Rent-A-Car case study does not require inheritance. The proposal does not list inheritance as a required deliverable. For the thesis, inheritance can be mentioned as a natural extension and documented as Future Work with a brief note on how it would be handled (likely M-rules analogous to A10).

### Constraints (Chapter 7.2)

Snoeck defines several types of constraints that can be added to a MERODE model:
- Uniqueness constraints (like a unique key in a database)
- Attribute constraints (value ranges, formats)
- Method constraints (preconditions on events, like "a copy cannot be borrowed if it is already borrowed")
- Referential integrity constraints (derived from existence dependencies)
- Sequence constraints (more detailed ordering than the FSM alone)

None of these are currently captured in `merode-schema.json` or processed by the agent. Capturing constraints properly would require significantly extending the schema and generating corresponding Mendix logic (validation microflows, entity constraints, etc.).

**Justification for exclusion:** Constraints would be an extension of M4's lifecycle implications. The current M4 generates the structural association but not the constraint. The proposal does not list constraints as a required deliverable. For the thesis, this is Future Work.

### IS-Service Layer (Chapter 9) and Business Process Layer (Chapter 10)

Snoeck's IS-Service Layer describes input services (event generation) and output services (information retrieval). The Business Process Layer shows how to link business processes to the domain model. Neither is in scope for this thesis — the focus is on the domain model (EDG + OET + FSMs) as the CIM input.

---

## 4. Architectural Limitations

### The `isMerodeFSM()` discriminator is fragile

The mechanism that distinguishes DEMO FSMs from MERODE FSMs in the downstream agent is: DEMO regions always have `forEvent` set; MERODE regions never do. This is a property of the PIM encoding, not an explicit language tag.

A third language that uses FSMs without event-annotated regions would be incorrectly classified as "MERODE-like" by this discriminator. The workaround would be to add an explicit `fsmStyle: "orthogonal" | "sequential"` field to the StateMachine definition in pimUML. But this would be a more intrusive schema change, and since the current scope is only DEMO and MERODE, the structural discriminator is sufficient.

### Single case study limits evaluation scope

The evaluation (D7) applies only to the Rent-A-Car case study. Snoeck uses a library case study as his running example; Bzowski uses Rent-A-Car. Using Rent-A-Car allows direct comparison with Bzowski's results but means the evaluation doesn't test edge cases not present in that model (no inheritance, no constraints, no multi-level propagation chains, single creating event per object type, etc.).

A more thorough evaluation would use multiple case studies. This is acknowledged as a limitation of the empirical scope.

### The Mendix application cannot be deployed without a Mendix cloud licence

The output is a valid Mendix model that can be opened in Mendix Studio Pro, but actually running the application requires a Mendix cloud environment or a local runtime licence. The evaluation therefore assesses the structural validity of the generated model (no Mendix errors/warnings) rather than runtime behaviour.

### Soft-coded environment variable for PIM source agents

The `pim-to-mendix-agent` subscribes to PIM topics from agents listed in the `PIM_PUBLISHER_AGENT_IDS` environment variable. When a third agent is added, this variable must be updated. This is a configuration change (not a code change), but it means the downstream agent is not entirely oblivious to the set of upstream agents. For the extensibility criterion this is borderline — discussed in EXTENSIBILITY_EVIDENCE.md.

---

## 5. Known Implementation Bugs Fixed During Development

These are included here for documentation completeness, in case reviewers ask about them.

**CE7247 — Reserved field name `id`:** The initial M1 implementation used `name: "id"` for the logical identifier attribute. Mendix reserves `id` as a system attribute name. Fixed by using `name: \`${ot.name}ID\`` (e.g., `RentalID`).

**CE0117 — Quoted enum expression:** The initial B14 implementation wrapped enum literal expressions in single quotes (`'Module.Enum.Value'`). Mendix microflow expressions use unquoted enum references (`Module.Enum.Value`). Fixed by removing the quotes from the `MemberChange.value` string.

**CW0263 — Empty enum caption:** Mendix requires at least one language-specific caption for each enumeration value. The initial implementation created enum values without captions. Fixed by adding an English caption (capitalised value name) using `texts.Text.createInEnumerationValueUnderCaption(v)`.

**`Wait_undefined` in Workflow generation:** The Workflow generator tried to create a WaitForNotification activity named `Wait_${region.forEvent}`. For MERODE regions (where `forEvent` is undefined), this produced `Wait_undefined`. Fixed by adding the `isMerodeFSM()` check to skip Workflow generation for MERODE FSMs entirely.

**MERODE PIM never reached the Mendix agent:** The `pim-to-mendix-agent` was hardcoded to subscribe only to the DEMO agent's MQTT topic. MERODE PIM messages were published to a different topic and silently ignored. Fixed by switching to the `PIM_SOURCE_AGENTS` multi-subscription approach.
