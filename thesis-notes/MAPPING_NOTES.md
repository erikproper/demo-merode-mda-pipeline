# Transformation Rules (D4)

Working document on the formal mapping rules for both transformation stages. The A-rules (DEMO to pimUML) are taken from Bzowski [4]. The M rules (MERODE to pimUML) are derived in this thesis from Snoeck [21]. The B rules (pimUML to Mendix) are also taken from Bzowski [4], with the MERODE extensions from this thesis.

The rules are presented here in the form in which I implemented them. A detailed justification for each rule can be found in `MerodeMappingRules.md` (M-rules) and `SqlMappingRules.md` (S-rules); Section 7 compares DEMO and MERODE where they diverge.

---

## 1. Overview of the Transformation Chain

```
CIM (DEMO Fact Model)     pimUML (PIM)   Mendix (PSM)
CIM (MERODE Domain Model)    |
                          pimuml-schema.json
                          (JSON Schema, strict)
```

The pimUML-PIM is the hub. The A-rules and M-rules define the two upstream paths (CIM to PIM). The B-rules define the single downstream path (PIM to PSM). The design goal is for the B-rules to be language-agnostic: they operate on pimUML constructs, not directly on DEMO or MERODE constructs. Whether a given pimUML class originates from a DEMO EntityType or a MERODE ObjectType should be irrelevant to the B-rules. In practice, there is a language-specific logic for FSMs, which is distinguished via `isMerodeFSM()`: B11/B12 map DEMO regions (`forEvent`), while B13-B16 map MERODE lifecycles. The structural B-rules (B1-B10) are language-agnostic.

---

## 2. Source Concepts in MERODE (Quick Reference)

Before delving into the rules, it is helpful to have a concise overview of what MERODE entails. Based on Snoeck [21], Chapter 3.

The domain model consists of three submodels. The Existence-Dependency Graph (EDG) is the structural view: similar to a UML class diagram, but with the condition that all associations must express existence dependencies. An object type B is existence-dependent on A if the lifetime of a B instance is always contained within the lifetime of an A instance (Snoeck, Ch. 4, pp. 79 - 105). The Object-Event Table (OET) is the interaction view: a table with business event types as rows and object types as columns. Each cell specifies whether the object type is created (C), modified (M), or terminated (E) in response to the event. Crucially, ownership dependencies are initially marked manually, while propagated dependencies are automatically derived from the EDG via propagation rules (Snoeck, Chapter 5, pp. 107 - 125). Finite-state machines (FSMs) represent the lifecycle view: one FSM per object type, which specifies sequence constraints for events beyond what the OET already implies (Snoeck, Ch. 6, pp. 127 - 147).

Overview of Key Concepts: An ObjectType (business object type) has an identity, a state described by attributes, and a duration. It is always involved in at least two events (creation and termination), which are written in CAPITAL LETTERS in the book. A BusinessEventType (business event type) is atomic, occurs at a single point in time, and involves one or more object types. An ExistenceDependency is a directed relationship in which the lifetime of the dependent object type is fully contained within the lifetime of the primary object type. The OET cell values are: `O/C` = owner, created; `O/M` = owner, modified; `O/E` = owner, ended; `A/M` = affiliated (propagated), modified. The `A/M` entries are automatically derived from the propagation rule and do not need to be specified manually. Lifecycle states are named phases in the life of an object, ordered sequentially.

---

## 3. A-Rules: DEMO Fact Model to pimUML

Bzowski's rules [4], Table 10.1. Included here for the sake of completeness and for the language comparison in Section 7.

| ID  | DEMO Fact Model Source Concept                              | pimUML Target                                                                                                             |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A1  | Value type, user-defined, categorical                       | Enumeration                                                                                                               |
| A2  | Value type, user-defined, non-categorical                   | DataType (user-defined)                                                                                                   |
| A3  | Declared Entity Type                                        | Class + Integer Identifier (isID=true) + StateMachine                                                                     |
| A4  | Derived Entity Type                                         | Class (isDerived=true) + StateMachine                                                                                     |
| A5  | Attribute Type                                              | Property                                                                                                                  |
| A6  | Event type                                                  | Boolean property (default false) + orthogonal region in the owner StateMachine with false/true states and a trigger       |
| A7  | Specialization of an entity type with an event type         | Integer ID for child + directed association (child to parent, role "parent") + Create activity in the parent's true state |
| A8  | Specialization of a value type with event type and property | AssociationClass                                                                                                          |
| A9  | Specialization of an entity type with derivation rule       | Class (isDerived) + Association (child to parent) + OCL derivation expression                                             |
| A10 | Generalization                                              | Abstract parent class + Generalization                                                                                    |
| A11 | Aggregation                                                 | Integer ID for part in whole class + Association with aggregation adornment                                               |
| A12 | Property type + cardinality laws                            | Association + multiplicities                                                                                              |

Implementation location: `mda-agents/demo-to-pim-agent.ts`. All 12 rules have been implemented and validated against the Rent-A-Car DEMO fixture.

---

## 4. M-Rules: MERODE Domain Model to pimUML

These rules are derived in this thesis from Snoeck [21]. The numbering M1-M9 is my own; it parallels Bzowski's A-rules where possible and introduces new rules for concepts without a DEMO counterpart.

### M1 - ObjectType to Class + Integer ID

Source concept: MERODE ObjectType. Target: pimUML Class + Property (Name: `<TypeName>ID`, Type: Integer, isID: true).

A MERODE ObjectType is a business object with identity, state (attributes), and duration (Snoeck, p. 53). The structural projection directly corresponds to Bzowski's Rule A3: the Class captures identity and structural description. The integer logical identifier is added according to the A3 convention.

Implementation: `{ name: ot.name, ownedAttributes: [{ name: \`${ot.name}ID\`, type: "Integer", isID: true }, ...] }`

Mendix Note: `id` is a reserved system field name in Mendix (CE7247). The name `<TypeName>ID` works around this. This naming convention is consistent with A3 in Bzowski's implementation.

Relation to DEMO: Similar to A3. The main difference: MERODE ObjectTypes explicitly carry lifecycle information (`lifecycleStates`), while DEMO entity types do not; their lifecycle is derived entirely from event participation. The StateMachine is therefore attached separately via M5.

### M2 - Attribute to Property

Source concept: MERODE attribute. Target: pimUML property (name, type).

Attributes describe the observable state of a MERODE object type (Snoeck, p. 149). They map 1:1 to pimUML properties, equivalent to Bzowski's A5. The declared type of the attribute determines the type string of the property. If no type is declared, `String` is used as the default.

Implementation: `{ name: a.name, type: a.type ?? "String" }`

Relation to DEMO: Equivalent to A5. No semantic divergence at this level.

### M3 - Attribute with an Enumerated or User-Defined Domain to Enumeration/DataType

Source concept: MERODE attribute whose declared type is a known enumerated or user-defined domain. Target: pimUML Enumeration (if categorical) or DataType (if non-categorical).

Snoeck discusses attribute domains in Chapter 7 (pp. 149 - 168). If an attribute ranges over a fixed set of literal values (e.g., a vehicle category: economy, standard, luxury), the domain is categorical and maps to a pimUML Enumeration. If it is a user-defined scalar domain (e.g., a custom date format), it maps to a user-defined DataType.

This reflects Bzowski's A1/A2 distinction, applied to attribute domains rather than standalone concepts. The difference: in DEMO, value types are top-level concepts in the fact model. In MERODE, the domain constraint resides on the attribute itself.

Implementation: `merode-schema.json` contains a top-level `domainTypes` list. Each entry has `name`, `kind` (`"categorical"` or `"nonCategorical"`), and optional `literals`. An attribute references a domain via its `type` string. The agent processes `domainTypes` before the ObjectType loop and generates pimUML enumerations or data types. The `CarGroup` domain in the Rent-A-Car fixture demonstrates a categorical case.

```typescript
for (const dt of merode.domainTypes ?? []) {
  if (dt.kind === "categorical") {
    enumerations.push({ name: dt.name, literals: dt.literals ?? [] });
  } else {
    dataTypes.push({ name: dt.name });
  }
}
```

Implemented in `merode-to-pim-agent.ts`, schema in `merode-schema.json`, interface `MerodeDomainType` in `schemas/types.ts`.

### M4 - ExistenceDependency to Association

Source concept: MERODE ExistenceDependency (dependent, main object, multiplicity). Target: pimUML Association (directed, with multiplicities).

Existence dependencies are at the heart of MERODE (Snoeck, Chapter 4, p. 79). An ExistenceDependency specifies that every instance of the dependent object type is always associated with exactly one instance of the main object type and that the dependent cannot exist beyond the lifetime of the main object.

The structural projection is a directed association from the dependent to the main object with the specified multiplicities. The mandatory `lower` bound on the main object side (typically 1) reflects the existential condition.

Implementation:

```
associations.push({
  name: dep.name,
  memberEnds: [
    { name: "dependent", type: dep.dependent, lower: 0, upper: "*" },
    { name: "master",    type: dep.master,    lower: dep.lower ?? 1, upper: dep.upper ?? 1 }
  ]
})
```

Life Cycle Implication (not implemented): Snoeck (p. 88, Section 4.2.5) points out that existence dependencies have life cycle implications: a dependent object type must be created after the main object and must end before or at the same time as it does. Ideally, these constraints would be expressed as OCL invariants on the association. This is documented as a restriction.

Relation to DEMO: Analogous to A11/A12. The most important difference: in MERODE, every association expresses an existence dependency; there are no "mere" associations. This is a deliberate design restriction in MERODE that makes the EDG semantically more precise than a standard UML class diagram.

### M5 - ObjectType Lifecycle to Sequential StateMachine

Source concept: MERODE ObjectType with a `lifecycleStates` array. Goal: pimUML StateMachine with a region containing an initial pseudo-state, named simple states, and a final state.

This is the central new rule with no DEMO counterpart.

MERODE is explicitly lifecycle-oriented. Every object type has an FSM that describes the sequential phases of its life. The states are ordered and mutually exclusive: an object is in exactly one lifecycle state at any given time. Transitions between states are triggered by business events (Snoeck, Chapter 6, p. 127).

The trivial (standard) lifecycle consists of a creation phase, zero or more modification phases, and a termination phase. Snoeck represents this as a single active state with loops for all modifying events (Fig. 3.12, p. 68). Non-trivial lifecycles have intermediate states with more strictly restricted transition sequences.

The pimUML notation uses `kind: "initial"` for the initial pseudo-state, `kind: "simple"` for each named lifecycle state, and `kind: "final"` for the final pseudo-state. This required extending `State.kind` from `{initial, false, true}` to `{initial, false, true, simple, final}`, in an additive and backward-compatible manner (DD5 in DESIGN_DECISIONS.md).

For comparison: DEMO-FSMs vs. MERODE-FSMs: DEMO-FSMs consist of orthogonal regions, one per event type. Each region has exactly two states: `false` and `true`. The regions can be active simultaneously in any combination. Events are monotonic (once true, always true). MERODE-FSMs have a region with multiple named, sequential states. States are mutually exclusive. Events move the object from one state to the next. A termination event moves the object to a final state; after that, no further events are possible.

The structural discriminator used in the prototype: DEMO regions always set `forEvent` (one region per event), while MERODE regions never set it (one region in total, no event annotation). This is utilized by `isMerodeFSM()` in the downstream agent.

Implementation:

```typescript
stateMachines.push({
  name: `SM_${ot.name}`,
  entityType: ot.name,
  regions: [
    {
      name: "lifecycle",
      states: [
        { name: "__initial", kind: "initial" },
        ...lcStates.map((s) => ({ name: s, kind: "simple" })),
        { name: "__final", kind: "final" },
      ],
      transitions: smTransitions,
    },
  ],
  activities: smActivities,
});
```

### M6 - Generating Event (C) to Transition from Initial State + Create Activity

Source concept: BusinessEventType with `role: "C"` for an ObjectType. Goal: Transition from `__initial` to the first lifecycle state with trigger = event name, plus a `Create_<Type>` activity (kind: "create").

In MERODE, a creating business event (C in the OET) brings an object instance into existence (Snoeck, p. 64). In the sequential FSM, this is modeled as the transition that leaves the initial pseudo-state.

The first lifecycle state is always `lcStates[0]`. If no explicit lifecycle states are specified, no FSM is generated.

Implementation:

```typescript
smTransitions.push({ from: "__initial", to: lcStates[0], trigger: evt.name });
smActivities.push({ name: `Create_${ot.name}`, kind: "create", targetType: ot.name });
```

Relation to DEMO: Similar to A6/A7, which also generate Create activities. The difference: in DEMO, the Create activity is attached to the `true` state of the event region in the parent entity FSM. In MERODE, it is a top-level transition in the object type's own FSM.

### M7 - Modifying Event (M) to State Transition + Set Activity

Source concept: BusinessEventType with `role: "M"`, optional `fromState` and `toState`. Target: Transition between two lifecycle states + `Set_<Type>_<EventName>` activity (kind: "set").

A modifying business event (M) changes the state of an existing object without creating or terminating it (Snoeck, p. 64). In the FSM, it is a transition between named lifecycle states.

The `fromState` and `toState` fields in the MERODE schema allow for the explicit specification of which states the transition connects. If not specified, the implementation falls back to sequential order within `lifecycleStates`.

Implementation:

```typescript
const from = evt.fromState ?? lcStates[0];
const toIdx = lcStates.indexOf(from) + 1;
const to =
  evt.toState ??
  (toIdx < lcStates.length ? lcStates[toIdx] : lcStates[lcStates.length - 1]);
smTransitions.push({ from, to, trigger: evt.name });
// resolve attribute types from OT definition for PSM generation
const effects = (evt.effects ?? []).map((ef) => ({
  attribute: ef.attribute,
  type: ot.attributes?.find((a) => a.name === ef.attribute)?.type ?? "String",
}));
smActivities.push({
  name: `Set_${ot.name}_${evt.name}`,
  kind: "set",
  targetType: ot.name,
  ...(effects.length > 0 ? { effects } : {}),
});
```

The optional `effects` array in `BusinessEventType` (MERODE schema) lists the attributes that an M-event modifies. The attribute type is resolved from the OT attribute list at transformation time and passed to the pimUML activity so that the downstream B15 rule can generate correctly typed microflow parameters - without resorting to the MERODE model.

Relation to DEMO: Analogous to the set activities in A6. The main difference: in DEMO, the transition moves a Boolean region from `false` to `true` (monotonic). In MERODE, it moves between two named, mutually exclusive lifecycle states, changing specific attributes in the process.

### M8 - Terminating Event (E) to Transition to the Final State + End Activity

Source concept: BusinessEventType with `role: "E"`. Goal: Transition from the last lifecycle state to `__final` + `End_<Type>` activity (kind: "end").

A terminating business event (E) ends the life of the object (Snoeck, p. 64). The object enters the final state and is considered "terminated"; no further events are possible. Snoeck emphasizes (Section 5.2.1, p. 113) that termination is not the same as physical deletion: "ending an object is not the same as physically removing the object, but it only means that a physical removal is allowed."

The transition always goes from `lcStates[lcStates.length - 1]` (the last lifecycle state) to `__final`. This is consistent with the simple sequential lifecycle model. In a non-trivial FSM with multiple possible final states, each would require its own termination transition, but the current schema and test fixture assume a single terminal state.

Implementation:

```typescript
const lastState = lcStates[lcStates.length - 1];
smTransitions.push({ from: lastState, to: "__final", trigger: evt.name });
smActivities.push({ name: `End_${ot.name}`, kind: "end", targetType: ot.name });
```

Relation to DEMO: No counterpart. This is one of the two genuinely new rules (the other is M9). DEMO events are monotonic Boolean flags; once they occur, they are permanently recorded. There is no concept of "ending" an object's life in DEMO, because DEMO entity types do not have lifecycles in this sense. This rule is unique to MERODE and motivates the `end` activity child extension in pimUML.

### M9 - Shared Event Participation and Propagation Rule

Source Concept: OET entries in which multiple object types participate in the same event, including `A/M` entries derived via the propagation rule. Goal: synchronized transition triggers across multiple FSMs (one per participating object type).

This is MERODE's most distinctive feature, and one that has no counterpart in DEMO. In MERODE, a single business event is shared by all involved object types. When the `startRental` event occurs, it not only creates a `Rental` object (O/C in the Rental row), but also triggers modifying behavior in `Car` and `Person` (A/M entries from the propagation rule, Snoeck, Chapter 5.3.1, p. 114).

The propagation rule states: if object type B is existence-dependent on A (B depends on A), then every event that involves B also involves A with involvement type M. This means that the complete OET cannot be derived solely from ObjectTypes and BusinessEventTypes; it also requires the ExistenceDependency structure.

For implementation, M9 would require: parsing all existence dependencies to construct the propagation envelope; deriving, for each BusinessEventType, the additional ObjectTypes involved via transitive propagation; and generating M-role transitions in the FSMs of the affected main ObjectTypes.

Implementation: An M9 pre-pass first calculates the **transitive closure** of the EDG (not just direct dependencies). For each master OT, all transitively dependent OTs are collected; their events form the propagated set. Self-transitions are then added to the SM construction of each master OT: `{ from: state, to: state, trigger: evtName }` for each lifecycle state and each propagated event. A `Set_<Master>_<Event>` activity (kind: "set") is generated, identical to the M7 convention.

```typescript
// transitive closure
const directDeps = new Map<string, string[]>();
for (const dep of merode.existenceDependencies ?? []) { ... }

function allTransitiveDependents(master, visited = new Set()): string[] { ... }

const propagatedToMaster = new Map<string, string[]>();
for (const ot of merode.objectTypes) {
  const allDeps = allTransitiveDependents(ot.name);
  // collect all events from allDeps
  propagatedToMaster.set(ot.name, eventNames);
}
```

For the current Rent-A-Car fixture (6 OTs, 3-hop EDG chain: Invoice -> RentalLine -> Rental -> {Car, Branch, Person}), this means:

- Car, Branch, and Person each receive **12** propagated self-transitions (the 6 Rental events, 1-hop; the 3 RentalLine events, 2-hop; the 3 Invoice events, 3-hop) - since all three have only one lifecycle state, this amounts to exactly one self-transition per propagated event for each object type.
- Rental receives 6 propagated events (3 from RentalLine, 3 from Invoice), but because Rental has 4 lifecycle states (active, depositPaid, returned, invoicePaid), each event materializes as its own self-transition on each state - resulting in **24** self-transitions in SM_Rental.
- RentalLine receives **3** propagated self-transitions from Invoice (1-hop, one lifecycle state).
- Invoice has no master role and receives no propagated transitions.

In total, there are 45 atomic (event x master) propagation obligations, which generate 63 self-transitions in the actual, schema-valid Transform output (12+12+12+24+3). Complete classification table: `EVAL/FRAMEWORK.md` Section 2.

B15 in the Mendix agent generates change microflows for the master from this, which leave the status unchanged because all transitions of the propagated trigger are self-transitions (semantically a "Participated" marker).

Implemented in `merode-to-pim-agent.ts`. Formal specification: `MerodeMappingRules.md`.

---

## 5. B-Rules: pimUML to Mendix

Bzowski's B-Rules [4], Table 11.1, with MERODE-specific extensions (B13-B16 in this prototype's numbering, corresponding to new rules not included in Bzowski).

Note on numbering: Bzowski's table goes up to B24. The prototype does not implement all 24 rules (some are only needed for derived types, constraints, etc.). The prototype numbering B1-B16 reflects what is actually implemented, not a 1:1 mapping to Bzowski's numbering. The thesis (Section 6.4) uses this numbering and specifies the corresponding Bzowski rules for each rule. Since 2026-09-14, the code comments in `pim-to-mendix-agent.ts` have followed the same numbering and refer to Bzowski's numbers as "Bzowski Bn."

| ID  | pimUML Source Concept                                                                                                                    | Mendix Target                                                                                                        | Status      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------- |
| B1  | Model (Top-Level)                                                                                                                        | Mendix App + Module                                                                                                  | Implemented |
| B2  | Class                                                                                                                                    | Entity (domain model)                                                                                                | implemented |
| B3  | Class (isAbstract)                                                                                                                       | normal entity (Mendix does not support abstract entities; `isAbstract` is only logged)                               | implemented |
| B4  | Enumeration + EnumerationLiteral                                                                                                         | Mendix Enumeration + EnumerationValue (with English caption)                                                         | implemented |
| B5  | DataType                                                                                                                                 | Entity (no direct domain model equivalent)                                                                           | implemented |
| B6  | Property (isID=true)                                                                                                                     | Integer attribute                                                                                                    | implemented |
| B7  | Property (regular)                                                                                                                       | String / Integer / Boolean attribute                                                                                 | implemented |
| B8  | AssociationClass                                                                                                                         | Entity + two associations                                                                                            | implemented |
| B9  | Association + multiplicities                                                                                                             | Mendix Association with Owner/Reference settings                                                                     | implemented |
| B10 | Generalization                                                                                                                           | Mendix Generalization/Specialization                                                                                 | implemented |
| B11 | StateMachine (DEMO)                                                                                                                      | `ACR_<Entity>` microflow (After-Create handler): Commit + one WorkflowCallAction per region                          | implemented |
| B12 | DEMO region + false/true states                                                                                                          | one workflow `WF_<Entity>_<forEvent>` per region: WaitForNotification + CallMicroflowTask (Set, Create if necessary) | implemented |
| B13 | MERODE StateMachine (Life Cycle States)                                                                                                  | `<Entity>_Status` Enumeration                                                                                        | Implemented |
| B14 | MERODE Create Activity                                                                                                                   | `Create_<Entity>` Microflow: CreateObject + Set Status to Initial State                                              | Implemented |
| B15 | MERODE Set Activity                                                                                                                      | `Set_<Entity>_<Event>` microflow: ChangeObject status to target state (not applicable for pure self-transitions)     | implemented |
| B16 | MERODE End Activity                                                                                                                      | `End_<Entity>` microflow: DeleteAction (object is removed from the DB)                                               | implemented |
|     | Empty `<Entity>_Overview` page for each entity (title + layout, no widgets, no detail pages) + navigation entry, first page as home page | Mendix Pages + Navigation                                                                                            | implemented |

### B11/B12 - DEMO StateMachine to ACR Microflow and Workflows per Region

Each region of a DEMO StateMachine (A6) has its own Mendix workflow `WF_<Entity>_<forEvent>` with the entity as the `WorkflowContext`. It consists of a start, `WaitForNotification`, `Wait_<forEvent>` (trigger, B23 in Bzowski), `CallMicroflowTask` on `Set<Entity>_<forEvent>` (transition effect), optionally a `CallMicroflowTask` on the entry activity of the true state, e.g., `CreateDepositPaidRental` (B24 in Bzowski), and an End. The microflow `ACR_<Entity>` takes the entity as a parameter, commits it, and then starts all region workflows one after another using a `WorkflowCallAction` for each. It is registered as an After-Create `EventHandler` on the entity, so that the workflows start automatically when an object is created. The commit is necessary because Mendix only starts workflows for committed objects (DD13). For Rental, this results in six workflows and one ACR microflow with a commit and six calls.

This follows Bzowski [4], sections 11.2.2 - 11.2.3 (one workflow per region, `ACR_Rental` with one `CallWorkflowActivity` per region). Because all workflows wait simultaneously, the regions remain orthogonal: `depositPaid` can occur before `rentalExtended`. The division into workflow plans is externalized as a pure function, `planRegionWorkflows()`, and tested offline (`mda-agents/tests/test-mendix-workflows.ts`).

Until 2026-09-14, the agent generated a single workflow `WF_<Entity>` per state machine, in which the regions were chained together sequentially. As a result, `WF_Rental` had to wait for `rentalExtended` before it could even receive `depositPaid`. This caused the orthogonality of the DEMO regions to be lost.

### B13 - MERODE Lifecycle States to the Mendix Status Enumeration

When a MERODE StateMachine with `simple`-kind states is received, the agent creates a `<Entity>_Status` enumeration in the Mendix domain model. Each lifecycle state name becomes an enumeration value with an English caption (name with a capitalized first letter). A `status` attribute of this enumeration type is added to the corresponding entity.

This is the simplest way to represent lifecycle states in Mendix without using workflows. Mendix workflows are the "proper" way to handle state machines, but generating workflows for sequential MERODE FSMs requires significantly more complex SDK code. The status attribute approach is easier to implement and makes the lifecycle state visible in the domain model and queryable in microflows.

### B14 - MERODE Create Activity to Create Microflow

The `Create_<Entity>` microflow creates a new entity object using `CreateObjectAction` and sets the `status` attribute to the first lifecycle state using a `ChangeObjectAction` and a `MemberChange`. The expression for the status assignment is `<Module>.<Entity>_Status.<firstState>` without quotes, because Mendix microflow expressions use unquoted enum references, not string literals. Getting this right required some debugging (CE0117 caused by quoted expressions).

### B15 - MERODE Set Activity to Change Microflow

The `Set_<Entity>_<EventName>` microflow takes the entity as a required parameter and executes a `ChangeObjectAction`. The target state is determined by `resolveStatusTarget()`: From all transitions in the region triggered by the event, the self-transitions (`from === to`) are discarded. If exactly one target state remains, a `MemberChange` sets the `status` attribute to that state. If none remain - because the event triggers only self-transitions in the lifecycle (an M7 event without a state change or an M9 propagated event) - no `MemberChange` for the status is generated, and the status remains unchanged. If multiple different target states exist, a warning is issued, and the first one is used.

If the pimUML activity also contains `effects`, an additional Microflow parameter (with the correct type) and an additional `MemberChange` are generated for each Effect attribute. For `Set_Rental_extendRental`, this results in: parameter `rental: Rental`, parameter `newEndingDay: String`, and the `ChangeObject` sets `rental.endingDay = $newEndingDay` while leaving the status unchanged (`active -> active`). `Set_Rental_payDeposit` sets `rental.status = depositPaid`. `Set_Rental_addRentalLine` (propagated from `RentalLine`) does not change any attributes and simply commits the object. Effects on DataType-typed attributes (e.g., `depositAmount: MoneyAmount`) receive a string parameter but no `MemberChange` because the attribute is implemented as an association according to B5 (see `LIMITATIONS.md`).

Until 2026-09-14, the agent took the first transition with a matching trigger (`transitions.find`). For the six propagated Rental events, this is the self-transition `active -> active`, so that, for example, `Set_Rental_addRentalLine` would have reset a rental that had already been returned to `active`. Offline test: `mda-agents/tests/test-mendix-status.ts`.

### B16 - MERODE End Activity to Delete Microflow

The `End_<Entity>` microflow takes the entity as a parameter and executes a `DeleteAction`. In Mendix, this constitutes a permanent removal from the database. This is an interpretation of M8, not a direct equivalent: in Snoeck, the terminating event brings the object to a final state and only permits physical removal (Section 5.2.1, p. 113). Alternatively, a soft delete would be possible (setting the status attribute to an "ended" value), but this would require an additional enum value in the \_Status enum and filters in all queries. Hard delete was chosen as the simplest permissible option (DD12).

The generator does not apply any delete behavior to the associations; the Mendix standard applies (`DeleteMeButKeepReferences` on both sides). Deleting a master is therefore neither blocked nor cascaded; dependent objects remain without a reference. The existence dependency from the EDG is not enforced during deletion (LIMITATIONS.md).

---

## 6. S-Rules: pimUML to PostgreSQL DDL

Second PSM path, running in parallel with the B-Rules (Section 5). Both paths consume the same `model.pim.created` artifact; the only difference is the target platform (Mendix app vs. PostgreSQL script). Implemented in `mda-agents/pim-to-sql-agent.ts`.

| ID  | pimUML Source Concept                                            | SQL Target                                                                                | Status                                    |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| S1  | `enumerations[]`                                                 | `CREATE TYPE <name>_enum AS ENUM (...)`                                                   | implemented                               |
| S2  | `dataTypes[]`                                                    | separate table, only `id SERIAL PRIMARY KEY`                                              | implemented                               |
| S3  | `associationClasses[]`                                           | Junction table with two NOT NULL foreign keys + custom attribute columns                  | implemented                               |
| S4  | `classes[].ownedAttributes[]` (not derived, not a DataType type) | Column with type-mapped SQL type                                                          | implemented                               |
| S5  | `ownedAttributes[].isDerived === true`                           | Column is omitted                                                                         | implemented                               |
| S6  | Attribute with `type` = name of a `dataTypes[]` entry            | FK column to the DataType table (S2)                                                      | implemented                               |
| S7  | `generalizations[]`                                              | Child table gets `<parent>_id` FK, `ON DELETE CASCADE`                                    | implemented                               |
| S8  | `associations[]` (1:1, 1:n)                                      | FK column `<Role>_id` on the many table; if there is a name collision, `<Association>_id` | implemented                               |
| S9  | `associations[]` (n:m)                                           | Dedicated junction table with two NOT-NULL foreign keys                                   | Implemented                               |
| S10 | `stateMachines[]`, sequential (`isMerodeFSM`)                    | `status` column + `<Entity>_status_enum`                                                  | Implemented                               |
| S11 | DEMO-orthogonal FSMs                                             | no special rule - follows S4                                                                | implemented (no additional code required) |
| S12 | Table order                                                      | topological sort (Kahn) based on the FK dependency graph                                  | implemented                               |

Complete rationale text for each rule, design decision regarding DataType mapping (S2/S6), and the Rent-A-Car validation: `SqlMappingRules.md`.

The key difference from the MERODE integration: the SQL Agent is purely a consumer of the existing `pimuml-schema.json` and does not introduce any PIM extensions. While MERODE introduced new PIM concepts and thus had to additively extend the shared schema (Section 4.5, M5), the SQL agent covers the same pimUML constructs that B1-B13 already consume - only with a different target syntax. This makes it the cleaner of the two extensibility proofs: zero changes to `pimuml-schema.json`, `bus-client.ts`, `agent-utils.ts`, or either of the two CIM agents (diff proof: `EXTENSIBILITY_EVIDENCE.md`).

---

## 7. Cross-Language Comparison at the PIM Level

This table shows how DEMO and MERODE source concepts are mapped to pimUML, and how the PIM construct is subsequently processed by the two PSM paths (Mendix, SQL). This is the comparison the thesis needs to concretize both the CIM heterogeneity requirement and the PSM extensibility requirement.

| Concept Category           | DEMO Source                    | MERODE Source                     | pimUML Target                      | Equivalent?                           | Mendix Target (B)                      | SQL Target (S)                                     |
| -------------------------- | ------------------------------ | --------------------------------- | ---------------------------------- | ------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| Business Object            | EntityType (declared)          | ObjectType                        | Class                              | Yes                                   | Entity (B2)                            | Table (S4)                                         |
| Identity                   | Integer ID from A3             | ObjectType (ID from M1)           | Property (isID=true)               | Yes                                   | Integer Attribute (B6)                 | `PRIMARY KEY` column (S4)                          |
| Attribute                  | AttributeType (A5)             | Attribute (M2)                    | Property                           | Yes                                   | Attribute (B7)                         | Column (S4)                                        |
| Categorical Domain         | ValueType/categorical (A1)     | Attribute with enum domain (M3)   | Enumeration                        | Similar                               | Enumeration + Captions (B4)            | `CREATE TYPE ... ENUM` (S1)                        |
| Scalar Domain              | ValueType/non-categorical (A2) | Attribute with scalar domain (M3) | DataType                           | Similar                               | Entity without structure (B5)          | Table without structure (S2)                       |
| Relationship               | FactType / Property (A12)      | ExistenceDependency (M4)          | Association                        | Similar                               | Association (B9)                       | Foreign Key Column or Junction Table (S8/S9)       |
| Aggregation                | Aggregation Fact (A11)         | No direct counterpart             | Association with Aggregation       | Unidirectional                        | Association Adornment (B9)             | No special rule; same as regular association       |
| Inheritance                | Generalization (A10)           | Chapter 8, not within scope       | Generalization                     | Unidirectional                        | Generalization/Specialization (B10)    | Required foreign key with `ON DELETE CASCADE` (S7) |
| Lifecycle FSM              | Orthogonal Region FSM (A6)     | Sequential FSM (M5-M8)            | StateMachine                       | Miscellaneous                         | Workflow (B11/B12) / Status Enum (B13) | No Rule (S11) / Status Column (S10)                |
| Generating Event           | Event type (A6/A7)             | BET with role C (M6)              | Transition + Create Activity       | Similar, but different context        | Create Microflow (B14)                 | `NotMapped` (DDL does not define behavior)         |
| Modifying event            | Event type (A6)                | BET with role M (M7)              | Transition + Set activity          | Similar, but monotonic vs. sequential | Set microflow (B15)                    | `NotMapped`                                        |
| Terminating event          | No counterpart                 | BET with role E (M8)              | Transition to final + End activity | New in MERODE                         | Delete microflow (B16)                 | `NotMapped`                                        |
| Shared event / propagation | No counterpart                 | Propagation rule (M9)             | Synchronized triggers              | New in MERODE                         | Change microflow (B15)                 | `NotMapped`                                        |

The two lines marked "New in MERODE" (M8, M9) are what paradigmatically distinguish MERODE from DEMO at the PIM level and justify the PIM extension. The FSM line differs in its internal structure but can be accommodated by the same PIM construct with a different internal structure.

The SQL column also illustrates the boundary between structural and behavioral PIM content: all structural lines (business object through inheritance) have an SQL target, while all behavioral lines (events, propagation) are deliberately treated as `NotMapped` by the S-rules - a PostgreSQL schema has no native concept for microflow logic. This is not a shortcoming of the S-rules, but rather a characteristic of the target platform, and it makes the structure/behavior interface of the pimUML metamodel itself visible.

---

## 8. Cross-References and Classification

The M-rules are presented here in the same format as in Bzowski: source concept, target concept, and reference to DEMO. The complete justification text for these can be found in `MerodeMappingRules.md`, and the text for the S-rules from Section 6 in `SqlMappingRules.md`.

The FSM comparison - orthogonal regions in DEMO versus sequential states in MERODE - is the most conceptually significant difference between the two languages: the DEMO FSM for `Rental` uses the Boolean regions `startRental`/`completeRental`, while the MERODE FSM uses an `active` state and the pseudo-states `__initial`/`__final`.

The pimUML schema changes for MERODE are minor and purely additive: `State.kind` has been extended, `Activity.kind` has been extended, and `Region.forEvent` has been made optional.

M9 is the most complex of the M-rules. The implementation is complete and has been verified against actual, schema-valid transform output (3-hop EDG chain, see above).
