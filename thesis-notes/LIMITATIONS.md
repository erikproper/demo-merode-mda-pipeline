# Limitations and Scope Boundaries

This document sets out what the prototype cannot do and why. I distinguish between two cases: a limitation is something the system does not do within the defined scope; Future Work lies outside the scope and would be a natural next step. For each limitation, I note why I accept it and what would be required to resolve it.

---

## 1. Implemented M-rules (formerly gaps)

### M3 - Attribute domains implemented correctly (2026-08-03)

`merode-schema.json` has been extended to include a `domainTypes` array. `MerodeDomainType` interface in `types.ts`. Categorical domains (e.g. `CarGroup`) become pimUML enumerations; non-categorical ones (e.g. `MoneyAmount`) become pimUML data types, which are implemented in the PSM agent as a Mendix entity with an association. Fully tested in the Rent-A-Car fixture.

Remaining limitation: the attribute type refers to the domain name as a string - the relationship is only resolved via the `domainTypes` array in the same model. This is not a problem for evaluation, as the fixture contains explicit `domainTypes` entries.

### M9 - Shared event participation and propagation implemented correctly (2026-08-03)

The propagation envelope is calculated from the EDG (`allTransitiveDependents()`). For every master OT whose dependents have events, self-transitions are inserted on all active lifecycle states (trigger = event name) . In addition, a `Set_<Master>_<evt>` activity is generated, which becomes a ChangeObjectAction microflow in the PSM agent.

Remaining limitation: propagation always generates self-transitions on all states of the master, even if the OET does not specify participation for certain state combinations. This is an over-approximation. For Car, Branch, Person and RentalLine (one lifecycle state each), this has no effect. Rental has four states and receives the six propagated events across all four (25 self-transitions including `extendRental`), e.g. `addRentalLine` also in `invoicePaid`. The agent does not check whether the OET permits this.

---

## 2. Gaps in the B-rules

### B16 - End microflow implemented correctly (2026-08-03)

The `End_<Entity>` microflow generates: MicroflowParameterObject (entity object) -> `DeleteAction` -> EndEvent. The design decision was to use a hard delete, because Snoeck permits physical removal after the terminating event
(Section 5.2.1, p. 113; however, "termination" is not the same as "deletion" there) and a soft-delete variant would require additional filter logic in all queries that extends beyond the prototype scope (DD12 in DESIGN_DECISIONS.md).

Remaining restriction: the generator does not apply any delete behaviour to the associations; the Mendix standard `DeleteMeButKeepReferences` applies. `End_Rental` therefore deletes a `Rental` even if `RentalLines` still exist, and these are left behind without a reference. The existence dependency from the EDG is not enforced during deletion, either by blocking or by cascading. Furthermore, `End_<Entity>` does not check whether the object is in its final lifecycle state (as in B15 without an initial state check).

### B15 - Status issue with self-transitions resolved (2026-09-14)

The `Set_<Entity>_<evt>` microflow set the status to the target of the first transition with a matching trigger. For M9-propagated events, this is the self-transition of the first state; for Rental, this is always `active`, regardless of the actual state. Self-transitions are now ignored (`resolveStatusTarget()`), and the status remains unchanged for pure self-transitions. Test: `mda-agents/tests/test-mendix-status.ts`.

Remaining limitations:

- The microflow does not check the source state. `Set_Rental_payDeposit` sets `depositPaid` even if the rental has already been `returned`. MERODE's sequence condition is therefore not enforced in Mendix. Fix: Add a Decision element before the ChangeObjectAction that checks `status` against the `from` states of the transitions.
- If a trigger leads to different target states (e.g. from two states to two different subsequent states), only the first is used and a warning is logged. This does not occur in the Rent-A-Car model.
- Effects on DataType-typed attributes (`Set_Rental_payDeposit.depositAmount`, `Set_Rental_payInvoice. invoiceAmount`, both `MoneyAmount`) are not set. The parameter `new<Attr>` is created as a string, but the attribute exists in Mendix only as an association to the DataType entity (B5); therefore, the agent logs `effect attribute ... not found` and does not generate a `MemberChange`. Resolution: Map DataType values inline as attributes, or create and link a DataType object within the microflow.
- The fact that Studio Pro accepts a `ChangeObjectAction` without a `MemberChange` (propagated microflow without effects) without issuing a warning has been confirmed by the QR3 check on 2026-09-17.

### B11/B12 - One workflow per DEMO region resolved (2026-09-14)

Previously, all regions of a DEMO StateMachine were chained together sequentially in a single `WF_<Entity>` workflow. This meant that events had to occur in the order of the regions, which contradicts the orthogonality of the regions.
Now, a separate workflow `WF_<Entity>_<forEvent>` is created for each region, and `ACR_<Entity>` initiates them all (as in Bzowski [4], Section 11.2.3). Test: `mda-agents/tests/test-mendix-workflows.ts`.

Remaining limitations:

- CE0049 was observed in an earlier implementation stage for every `WorkflowCallAction` in the ACR microflow ("No variable name specified", because the SDK cannot create a logical `MicroflowParameter`). During the QR3 check on 2026-09-17, the error no longer occurred in any of the four generated apps; all four open with 0 errors and 0 warnings. The workaround via `MicroflowParameterObject` stored in the agent appears to be sufficient in the version of Studio Pro used. The warning line output by `pim-to-mendix-agent.ts` when generating each set microflow is therefore obsolete and describes a state that can no longer be reproduced.
- The fact that Mendix permits multiple workflows running in parallel with the same context object without issuing a warning has been confirmed by the QR3 check on 2026-09-17 (0 warnings with 17 workflows and 5 ACR microflows in the rule coverage DEMO).
- `ACR_<Entity>` has been registered as an after-create handler since 2026-09-14 and commits the object before the workflow starts (DD13). Consequence: a newly created object is immediately present in the database, even if the user aborts the form. Remedy: start workflows only upon the first regular commit, protected by a flag on the object.

### Workflow generation for MERODE is omitted

The DEMO pipeline generates a Mendix workflow for each region of an entity type FSM, containing a `WaitForNotification` activity (B12). The MERODE pipeline does not do this. The `isMerodeFSM()` check in the `pim-to-mendix-agent` skips workflow generation for MERODE state machines.

Mendix workflows are designed for long-running processes with human interaction points. They are well suited to DEMO's Boolean regions, as each region can become a workflow wait activity. MERODE's sequential FSMs cannot be mapped so directly to Mendix workflows: the lifecycle states would become workflow activities, but the trigger-and-transition structure is fundamentally different.

Specifically: when the workflow generator encountered a MERODE FSM, it attempted to create a `WaitForNotification` activity named `Wait_<forEvent>`. However, MERODE regions do not have a `forEvent`, which resulted in the name `Wait_undefined` being generated. This was the error that led to the `isMerodeFSM()` skip.

Possible solution: map each lifecycle state to a workflow activity type and each transition to the progress logic. This would require new B-rule definitions and is planned as future work.

---

## 3. MERODE concepts not covered

The following MERODE concepts from Snoeck [21] are explicitly outside the scope.

### Inheritance (Chapter 8)

Snoeck devotes an entire chapter to inheritance in MERODE. Object types can be specialised by attributes (attribute-defined subclass), existence (existence-defined subclass) or state (state-defined subclass). Each form has different implications for event participation and lifecycle modelling.

The current implementation does not handle inheritance. The Rent-A-Car case study does not require it, and the proposal does not list it as a required deliverable. Inheritance could be implemented using M-rules analogous to A10 and would need to be documented in the thesis as a natural extension.

### Constraints (Chapter 7.2)

Snoeck defines uniqueness constraints, attribute constraints, method constraints (preconditions for events), referential integrity constraints and sequence constraints. None of these are currently recorded in `merode-schema.json` or processed by the agent. The correct recording of constraints would significantly extend the schema and require corresponding Mendix logic.

### IS Service Layer and Business Process Layer (Chapters 9 and 10)

Snoeck's IS Service Layer describes input services (event generation) and output services (information retrieval). The Business Process Layer shows how business processes are linked to the domain model. Both are outside the scope. The focus is on the domain model (EDG, OET and FSMs) as CIM input.

---

## 4. Architectural constraints

### The `isMerodeFSM()` discriminator is fragile

The mechanism that distinguishes DEMO FSMs from MERODE FSMs in the downstream agent is based on the fact that DEMO regions always set `forEvent`, whilst MERODE regions never do so. This is a property of the PIM encoding, not an explicit language tag.

A third language that uses FSMs without event annotations would be incorrectly classified as "MERODE-like" by the discriminator. The cleaner approach would be an explicit `fsmStyle: "orthogonal" | "sequential"` field in the StateMachine definition. However, for the current scope (DEMO and MERODE), the structural discriminator is sufficient.

### Single case study limits the scope of the evaluation

The evaluation (D7) applies only to the Rent-A-Car case study. Snoeck uses a library case study as an ongoing example, whilst Bzowski uses Rent-A-Car. This allows for a direct comparison with Bzowski's results.

Within this single case, the evaluation has, since 2026-09-17, covered two model pairs and thus four units of analysis: a rule coverage pair that triggers every A-rule and every M-rule at least once, and a case-based pair according to Bzowski. This closes two gaps previously mentioned here.
Inheritance is covered via the A10 generalisation `Vehicle`/`Car`, whilst multi-level event propagation is covered via the 3-hop M9 chain `Invoice -> RentalLine -> Rental -> {Car, Person, Branch}`.

Constraints, multiple generating event types per object type, and anything outside the Rent-A-Car domain remain unaddressed. A more comprehensive evaluation would utilise several case studies.

### Mendix application requires a cloud licence to run

The output is a valid Mendix model that can be opened in Mendix Studio Pro. Actually running the application requires a Mendix Cloud environment or a local runtime licence. The evaluation therefore assesses the structural validity of the generated model (no Mendix errors/warnings), not its runtime behaviour.

### The pimUML schema approximates UML metaclasses in a simplified manner

The `pimuml-schema.json` file does not map the pimUML metamodel (Bzowski, Figures C.2-C.3) with full UML 2.5.1 fidelity. All pattern-relevant metaclasses (shown in green in the legend) are present: `Class`, `Property`, `Association`, `AssociationClass`, `Generalization`, `Enumeration`, `StateMachine`, `Region`, `Transition`, `State`, `Pseudostate`, `Trigger`. The following simplifications have been made to facilitate JSON serialisation:

- `AggregationKind` (none/shared/composite on `Property`) → `isAggregation: boolean` on `PimAssociation`. Only the composite case is distinguished; shared aggregation is not required within the prototype scope.
- `ValueSpecification` hierarchy (`LiteralInteger`, `LiteralBoolean`, `LiteralUnlimitedNatural`) → `defaultValue?: string`. Literal values are serialised as plain strings rather than as typed object instances.
- `PrimitiveType` as a formal type node -> type strings (`"String"`, `"Integer"`, ...). The type of an attribute is referenced as a string, not as a standalone metamodel object.
- `InstanceSpecification` -> not implemented. Not required in the prototype scope.
- `Trigger` as a named object -> `trigger?: string` on `PimTransition`. Only the name is serialised.
- `Transition.effect -> Behavior` -> `alfExpression?: string`. Transition effects are represented as an ALF expression string, not as a complete `Behavior` object.
- `State.entry -> Behaviour` -> `entryActivity?: string`. Entry activities are referenced as a name string.
- `PseudostateKind` with 10 UML values -> `kind: "initial" | "false" | "true" | "simple" | "final"`. Only the states relevant to DEMO and MERODE are defined.

The activity diagram (third part of the pimUML metamodel) is approximated by the simplified `PimActivity` construct (`kind` + `effects`) - complex control flows within activities have been deliberately omitted, as they cannot be generated at the Mendix level without a dedicated expression parser. See also DD3 in DESIGN_DECISIONS.md.

### Configuration dependency for PIM source agents

The `pim-to-mendix-agent` subscribes to PIM topics from the agents listed in the environment variable `PIM_PUBLISHER_AGENT_IDS`. If a third agent is added, this variable must be updated. This is a configuration change, not a code change, but as a result, the downstream agent is not entirely oblivious to the set of upstream agents. For the extensibility criterion, this is a borderline case discussed in EXTENSIBILITY_EVIDENCE.md.

---

## 4a. Limitations of the S-rules (pim-to-sql-agent)

The SQL agent is purely a downstream consumer of `pimuml-schema.json` (see `SqlMappingRules.md`, Section 4) and therefore shares many of the aforementioned pimUML limitations unchanged. In addition, the SQL target platform itself has some specific implications.

### S7 - no shared primary key convention for generalisation

In the pimUML metamodel, every class is assigned its own independent `isID` attribute, including a generalisation child class. `pim-to-sql-agent.ts` therefore maps generalisation to a mandatory foreign key column (`<parent>_id`, `ON DELETE CASCADE`) rather than to the conventional relational primary key sharing convention (child table PK = parent table PK). This is functionally correct (referential integrity is guaranteed), but not the most elegant solution from a relational perspective: a child instance has two independent integer identities (its own `isID` column and the foreign key to the parent) instead of a shared one. A primary key sharing variant would require a convention on the pimUML side that does not currently exist (e.g. an explicit marker indicating that a generalisation child class does not have its own `isID` attribute, but instead adopts that of the parent). This is not an issue for the Rent-A-Car fixture (Car->Vehicle), as no query depends on the primary key sharing.

### S2/S6 - The DataType table reflects a PIM limitation rather than resolving it

As previously documented for the Mendix path (Section 4, "pimUML schema approximates UML metaclasses in a simplified manner"), a pimUML DataType does not have its own structure. `pim-to-sql-agent.ts` therefore generates a table for each DataType containing only an `id` column and references it via a foreign key (S2/S6),
rather than treating the DataType as an inline column type. This is deliberately not an SQL-specific improvement to the PIM limitation, but rather a faithful reflection of it - the rationale for this is set out in `SqlMappingRules.md`, Section 3. Consequence: a DataType such as `MoneyAmount` generates a practically empty table, which appears superfluous in a real database until pimUML DataTypes are given their own base type property.

### S12 - Cycles completely abort generation

`topoSortTables()` (Kahn algorithm) throws an exception in the event of a circular mandatory foreign key dependency between two or more tables and does not generate a DDL file at all, rather than outputting an incomplete solution or one resolved with `ALTER TABLE` additions. This is a deliberate fail-fast decision (a cycle would fail anyway when the DDL is actually executed), but it means that the agent produces no output whatsoever for a cyclic PIM model - not even for the cycle-free parts of the model. A more comprehensive solution would automatically append cyclic FKs as `ALTER TABLE ... ADD CONSTRAINT` after the `CREATE TABLE` statements (deferred FK), which would resolve the cycle; however, this is classified as Future Work, as no such cycle occurs in the Rent-A-Car fixture.

### S4 - unknown PIM type falls back to TEXT

`sqlType()` silently maps an unknown or undeclared `Property. type` string implicitly to `TEXT` instead of throwing an error. This prevents a typo or an unsupported PIM type from blocking the entire DDL generation, but it can mask genuine modelling errors (for example, a misspelt enum name would result in a `TEXT` column instead of an enum type, without a warning) . The Mendix agent (B7) also uses the same fallback strategy for the analogous case.

### S8/S9 - no UNIQUE constraints, column names partly derived from the association

S8 does not set a `UNIQUE` constraint on the foreign key column for 1:1 associations, and S9 does not set a `UNIQUE` constraint on the foreign key pair in the junction table. The database therefore enforces neither the upper limit of 1 on the second side of a 1:1 relationship nor the set semantics of an n:m relationship. If role names conflict within a table, the foreign key column is named after the association (`rental_depends_on_car_id`); otherwise, it is named after the role (`master_id`). Within a MERODE PIM, this results in two naming schemes coexisting side by side.

Not covered is an n:m self-association with the same role name at both ends, in which case S9 would write the same column twice to the junction table. Neither of the two EVAL-PIMs contains such a case.

---

## 5. Fixed implementation errors

These are documented in case reviewers ask for them.

**CE7247:** The initial M1 code used `name: "id"` for the logical identifier. Mendix reserves `id` as a system attribute name. Fixed by using `name: \`${ot.name}ID\``(e.g.`RentalID`).

**CE0117:** The initial B14 implementation enclosed enum literal expressions in single quotes (`"Module.Enum.Value"`). Mendix microflow expressions use enum references without quotes (`Module.Enum.Value`). Fixed by removing the quotes from the `MemberChange.value` string.

**CW0263:** Mendix requires at least one language-specific caption for each enum value. The initial implementation created enum values without captions. Fixed by automatically adding an English caption (with the first letter capitalised) via `texts.Text.createInEnumerationValueUnderCaption(v)`.

This correction initially only covered the B13 path, which generates the status enumerations for the MERODE lifecycles. The B4 path for the business-specific enumerations continued to set only the name, which is why CW0263 occurred three times in each of the four test units on the `CarGroup` enumeration. On 2026-09-19, the B4 path was aligned with the B13 path; both paths now set the same caption. The process is documented in `EVAL/FRAMEWORK.md`, Section 5, under Correction (2026-09-19), as it relates to the finding 0 warnings recorded there.

**CE6685** ("Parameters of the selected microflow have changed"): `CallMicroflowTask` steps in the generated workflow lacked `parameterMappings` entries because `MicroflowCallParameterMapping.parameter` requires a `MicroflowParameter` reference, which apparently cannot be created via the SDK. Resolved (2026-08-25) by: `MicroflowCallParameterMapping.create(model)`, `expression = "$WorkflowContext"`, and `__parameter.updateWithRawValue("Module.MicroflowName.parameterName")`. The Mendix Model Server automatically creates `MicroflowParameter` objects from `MicroflowParameterObject` during a flush - the qualified name reference therefore resolves correctly.

**Incorrect association cardinality** (Rental(1)->Person(\*) instead of Rental(\*)->Person(1)): `mxAssoc.parent` and `mxAssoc.child` were swapped.
In the Mendix SDK, the following applies: `parent` = many side (foreign key holder, shown as \*), `child` = one side (reference, shown as 1) - contrary to the intuitive relational ORM convention. Fixed (2026-08-25) in all three places in the agent (regular associations, DataType associations, AssociationClass approximations).

\*_Wait_undefined in the Workflow Generator:_ \* The workflow generator attempted to create a WaitForNotification activity named `Wait_${region.forEvent}`. For MERODE regions, where `forEvent` is undefined, this resulted in `Wait_undefined`. Fixed by the `isMerodeFSM()` check, which skips workflow generation for MERODE FSMs.

**S8 - duplicate FK columns with identical role names** (fixed 2026-09-14): S8 named every FK column `<Role>_id`. As a result, the DEMO PIM generated `branch_id` twice on `rental`, whilst the MERODE PIM generated `master_id` three times. PostgreSQL rejects both scripts. Until then, the execution test had only been run against the fixture `rent-a-car-pim-full.json`, which does not contain such a case. Fixed by introducing a collision rule (conflicting columns are named `<Association>_id`) and a test against both EVAL-PIMs (`SqlMappingRules.md` section 5a).

**MERODE-PIM did not reach the Mendix agent:** The `pim-to-mendix-agent` was hard-coded to subscribe only to the DEMO agent's MQTT topic. MERODE-PIM messages were silently ignored. Resolved by switching to the `PIM_SOURCE_AGENTS` multi-subscription approach.
