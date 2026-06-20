# Transformation Rules (D4)

Working notes on the formal mapping rules for both CIM→PIM and PIM→PSM transformations. The A-rules (DEMO→pimUML) are from Bzowski [4]. The M-rules (MERODE→pimUML) are derived in this thesis from Snoeck [21]. The B-rules (pimUML→Mendix) are from Bzowski [4] with MERODE extensions added in this work.

For the thesis I need a chapter that (a) presents the rules formally, (b) justifies each one from the source literature, and (c) compares DEMO and MERODE rules at the points where they diverge. These notes serve that purpose.

---

## 1. Overview of the Transformation Chain

```
CIM (DEMO Fact Model)   →   pimUML (PIM)   →   Mendix (PSM)
CIM (MERODE Domain Model) /         ↑
                                     |
                           pimuml-schema.json
                           (JSON Schema, strict)
```

The pimUML PIM acts as the junction point. The A-rules and M-rules define the two upstream paths (CIM→PIM). The B-rules define the single downstream path (PIM→PSM). A key design goal is that the B-rules are language-agnostic — they operate on pimUML constructs, not on DEMO or MERODE constructs directly. Whether a given pimUML Class came from a DEMO EntityType or a MERODE ObjectType should not matter to the B-rules. In practice there is some language-specific logic in the B-rules for FSMs (see B13–B16), but the structural B-rules (B1–B12) are fully language-agnostic.

---

## 2. Source Concepts in MERODE (Quick Reference)

Before the rules, it helps to have a crisp summary of what MERODE actually contains. Based on Snoeck [21], Chapter 3:

**Domain model = three sub-models:**
1. **Existence-Dependency Graph (EDG)** — structural view. Like a UML class diagram but with the constraint that *all* associations must express existence dependency. An object type B is existence-dependent on A if the life of a B instance is always contained within the life of an A instance. (Snoeck, Ch. 4, pp. 79–105)
2. **Object-Event Table (OET)** — interaction view. A table with business event types as rows and object types as columns. Each cell indicates whether the object type Creates (C), Modifies (M), or Ends (E) in response to the event. Crucially: owner participations are marked first, then propagated participations are derived automatically from the EDG via the Propagation Rule. (Snoeck, Ch. 5, pp. 107–125)
3. **Finite-State Machines (FSMs)** — lifecycle view. One FSM per object type, specifying constraints on the ordering of events beyond what the OET already captures (the OET implies a trivial default lifecycle: C* → M* → E). FSMs are only needed for non-trivial lifecycles. (Snoeck, Ch. 6, pp. 127–147)

**Key concepts:**
- **ObjectType** (business object type): has an identity, state described by attributes, duration (exists for a period of time), and is always involved in at least two events (creation + ending). Written in SMALL CAPS in the book.
- **BusinessEventType** (business event type): atomic, occurs at one point in time, involves one or more object types. Written in *italics*.
- **ExistenceDependency**: directed relationship where the dependent object type's lifetime is fully contained in the master's lifetime. Carried in the EDG.
- **OET cell values**: `O/C` = owner, creates; `O/M` = owner, modifies; `O/E` = owner, ends; `A/M` = affiliated (propagated), modifies. The `A/M` entries are derived automatically from the Propagation Rule — they don't need to be specified manually.
- **Lifecycle states**: named phases of an object's life, ordered sequentially. The default lifecycle is trivial (creating events → one active state with self-loops for modifying events → ending events). Non-trivial lifecycles require explicit FSM diagrams.

---

## 3. A-Rules: DEMO Fact Model → pimUML

These are Bzowski's rules [4], Table 10.1. Included here for completeness and for the cross-language comparison in Section 5.

| ID  | DEMO Fact Model source concept                           | pimUML target                                                                                                         |
|-----|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| A1  | Value type — user-declared, categorical                  | Enumeration                                                                                                           |
| A2  | Value type — user-declared, non-categorical              | User-defined DataType                                                                                                 |
| A3  | Declared entity type                                     | Class + Integer logical identifier (isID=true) + StateMachine                                                        |
| A4  | Derived entity type                                      | Class (isDerived=true) + StateMachine                                                                                 |
| A5  | Attribute type                                           | Property                                                                                                              |
| A6  | Event type                                               | Boolean Property (default false) + orthogonal Region in owner's StateMachine with false/true states and trigger       |
| A7  | Specialisation of entity type with event type            | Integer ID for child + directed Association (child→parent, role "parent") + Create activity in parent's true state   |
| A8  | Specialisation of value type with event type + property  | AssociationClass                                                                                                       |
| A9  | Specialisation of entity type with derivation rule       | Class (isDerived) + Association (child→parent) + OCL derivation expression                                           |
| A10 | Generalisation                                           | Abstract parent Class + Generalization                                                                                |
| A11 | Aggregation                                              | Integer ID for part in whole class + Association with aggregation adornment                                           |
| A12 | Property type + cardinality laws                         | Association + multiplicities                                                                                          |

**Implementation location:** `mda-agents/demo-to-pim-agent.ts`

**Status in prototype:** All 12 rules implemented and validated against the Rent-A-Car DEMO fixture.

---

## 4. M-Rules: MERODE Domain Model → pimUML

These rules are derived in this thesis from Snoeck [21]. The numbering M1–M9 is my own; they parallel Bzowski's A-rules where applicable and introduce new rules for concepts with no DEMO equivalent.

### M1 — ObjectType → Class + Integer ID

**Source:** MERODE ObjectType  
**Target:** pimUML Class + Property (name: `<TypeName>ID`, type: Integer, isID: true)

A MERODE ObjectType is a business object that has an identity, state (attributes), and duration (Snoeck, p. 53). The structural projection of this concept corresponds directly to Bzowski's rule A3: the Class captures the identity and structural description. The integer logical identifier is added following A3's convention.

**Implementation:** `{ name: ot.name, ownedAttributes: [{ name: \`${ot.name}ID\`, type: "Integer", isID: true }, ...] }`

**Mendix note:** `id` is a reserved system field name in Mendix (CE7247). The name `<TypeName>ID` avoids this. This naming convention is consistent with A3 as implemented by Bzowski.

**Relation to DEMO:** Similar to A3. Main difference: MERODE ObjectTypes explicitly carry lifecycle information (lifecycleStates), whereas DEMO entity types don't — their lifecycle is derived entirely from event participation. The StateMachine is therefore attached separately via M5.

### M2 — Attribute → Property

**Source:** MERODE Attribute  
**Target:** pimUML Property (name, type)

Attributes describe the observable state of a MERODE object type (Snoeck, p. 149). They map one-to-one to pimUML Properties, equivalent to Bzowski's A5. The attribute's declared type determines the property's type string. If no type is declared, `String` is used as a default.

**Implementation:** `{ name: a.name, type: a.type ?? "String" }`

**Relation to DEMO:** Equivalent to A5. No semantic divergence at this level.

### M3 — Attribute with Enumerated / User-Defined Domain → Enumeration / DataType

**Source:** MERODE Attribute where the declared type is a known enumerated or user-defined domain  
**Target:** pimUML Enumeration (if categorical) or DataType (if non-categorical)

Snoeck discusses attribute domains in Chapter 7 (pp. 149–168). Where an attribute ranges over a fixed set of literal values (e.g., a car category: economy, standard, luxury), the domain is categorical and maps to a pimUML Enumeration. Where the domain is a user-defined scalar (e.g., a custom date format), it maps to a user-defined DataType.

This mirrors Bzowski's A1/A2 distinction, applied at the level of the attribute domain rather than as a first-class concept. The difference: in DEMO, value types are defined as top-level concepts in the Fact Model. In MERODE, the domain constraint lives on the attribute itself and there is no equivalent "value type" concept at the top level.

**Implementation status: NOT IMPLEMENTED.** The current `merode-schema.json` defines attribute `type` as a plain string. No enumeration construction happens in the agent. This is a known gap — documented in LIMITATIONS.md.

**What would be needed:** The `merode-schema.json` would need a richer attribute domain specification (either a `domain: { kind: "categorical", values: [...] }` structure or a reference to a top-level type definition). The agent would then check whether the type reference resolves to an enumerated domain and emit a pimUML Enumeration accordingly.

### M4 — ExistenceDependency → Association

**Source:** MERODE ExistenceDependency (dependent, master, multiplicity)  
**Target:** pimUML Association (directed, with multiplicities)

Existence dependencies are the cornerstone of MERODE (Snoeck, Ch. 4, p. 79). An ExistenceDependency states that every instance of the dependent object type is always associated with exactly one instance of the master object type, and that the dependent cannot exist beyond the master's lifetime.

The structural projection is a directed Association from dependent to master, carrying the specified multiplicities. The mandatory `lower` bound on the master end (typically 1) reflects the existential constraint — every dependent must have a master.

**Implementation:** 
```
associations.push({
  name: dep.name,
  memberEnds: [
    { name: "dependent", type: dep.dependent, lower: 0, upper: "*" },
    { name: "master",    type: dep.master,    lower: dep.lower ?? 1, upper: dep.upper ?? 1 }
  ]
})
```

**Lifecycle implication (not implemented):** Snoeck (p. 88, Section 4.2.5) points out that existence dependency has lifecycle implications: a dependent object type must be created after its master exists and must end before or at the same time as its master. These constraints would ideally be expressed as OCL invariants on the association (equivalent to what A12 captures for DEMO). This is documented as a limitation.

**Relation to DEMO:** Similar to A11/A12. The key difference is that in MERODE *every* association expresses existence dependency — there are no "mere" associations. This is a deliberate design constraint in MERODE that makes the EDG more semantically precise than a standard UML class diagram.

### M5 — ObjectType Lifecycle → Sequential StateMachine

**Source:** MERODE ObjectType with `lifecycleStates` array  
**Target:** pimUML StateMachine with one Region containing an initial pseudostate, named simple states, and a final state

This is the central new rule — the one with no DEMO equivalent.

MERODE is explicitly lifecycle-oriented. Each object type owns a finite-state machine (FSM) describing the sequential phases of its life. The states are ordered and mutually exclusive: an object is in exactly one lifecycle state at any point in time. Transitions between states are triggered by business events (Snoeck, Ch. 6, p. 127).

The trivial (default) lifecycle — which applies to most object types — consists of a creation phase, zero or more modification phases, and an ending phase. Snoeck represents this as a single active state with self-loops for all modifying events, as shown in Fig. 3.12 (p. 68). Non-trivial lifecycles have intermediate states with more constrained transition sequences (the example in the book is COPY with `acquire → classify → borrow/return/renew* → lose/dispose`).

The pimUML encoding uses:
- `kind: "initial"` for the initial pseudostate
- `kind: "simple"` for each named lifecycle state (one per element of `lifecycleStates`)
- `kind: "final"` for the final pseudostate

This required extending `State.kind` from `{initial, false, true}` to `{initial, false, true, simple, final}`. The extension is additive and backward-compatible (DD5 in DESIGN_DECISIONS.md).

**How MERODE FSMs differ from DEMO FSMs:**

DEMO FSMs consist of *orthogonal* regions, one per event type. Each region has exactly two states: `false` and `true`. The regions can be in any combination of states simultaneously — the FSM records which events have occurred, not what "phase" the object is in. Events are monotonic (once true, always true).

MERODE FSMs have *one* region with *multiple named, sequential* states. States are mutually exclusive. Events move the object from one state to the next. An ending event moves the object to a final state, after which it accepts no further events.

The structural discriminator used in the pipeline: DEMO regions always have `forEvent` set (one region per event). MERODE regions never have `forEvent` (one region total, no event annotation). This is used by `isMerodeFSM()` in the downstream agent.

**Implementation:**
```typescript
stateMachines.push({
  name: `SM_${ot.name}`,
  entityType: ot.name,
  regions: [{
    name: "lifecycle",
    states: [
      { name: "__initial", kind: "initial" },
      ...lcStates.map(s => ({ name: s, kind: "simple" })),
      { name: "__final",   kind: "final" }
    ],
    transitions: smTransitions
  }],
  activities: smActivities
})
```

### M6 — Creating Event (C) → Transition from Initial + Create Activity

**Source:** BusinessEventType with `role: "C"` for an ObjectType  
**Target:** Transition from `__initial` to the first lifecycle state, with trigger = event name; plus a `Create_<Type>` activity (kind: "create")

In MERODE, a creating business event (marked `C` in the OET) brings an object instance into existence (Snoeck, p. 64). It corresponds to the creation method in the object's class. In the sequential FSM, it is modelled as the transition leaving the initial pseudostate.

The first lifecycle state is always `lcStates[0]` — whatever the first element of the `lifecycleStates` array is. If no explicit lifecycle states are given, no FSM is generated (the object type defaults to "no lifecycle modelled").

**Implementation:**
```typescript
smTransitions.push({ from: "__initial", to: lcStates[0], trigger: evt.name })
smActivities.push({ name: `Create_${ot.name}`, kind: "create", targetType: ot.name })
```

**Relation to DEMO:** Similar to A6/A7, which also produce Create activities. The difference is that in DEMO the create activity is attached to the `true` state of the event's region in the parent entity's FSM. In MERODE it's a top-level transition on the object type's own FSM.

### M7 — Modifying Event (M) → State Transition + Set Activity

**Source:** BusinessEventType with `role: "M"`, optional `fromState` and `toState`  
**Target:** Transition between two lifecycle states + `Set_<Type>_<EventName>` activity (kind: "set")

A modifying business event (marked `M`) changes the state of an existing object without creating or ending it (Snoeck, p. 64). In the FSM it's a transition between named lifecycle states.

The `fromState` and `toState` fields in the MERODE schema allow explicit specification of which states the transition connects. If not given, the implementation defaults to sequential order within `lifecycleStates` (from the current state to the next one).

**Implementation:**
```typescript
const from  = evt.fromState ?? lcStates[0]
const toIdx = lcStates.indexOf(from) + 1
const to    = evt.toState ?? (toIdx < lcStates.length ? lcStates[toIdx] : lcStates[lcStates.length - 1])
smTransitions.push({ from, to, trigger: evt.name })
smActivities.push({ name: `Set_${ot.name}_${evt.name}`, kind: "set", targetType: ot.name })
```

**Relation to DEMO:** Similar to the Set activities of A6. The key difference: in DEMO the transition moves a boolean region from `false` to `true` (monotonic). In MERODE the transition moves between two named, mutually exclusive lifecycle states.

### M8 — Ending Event (E) → Transition to Final State + End Activity

**Source:** BusinessEventType with `role: "E"`  
**Target:** Transition from the last lifecycle state to `__final` + `End_<Type>` activity (kind: "end")

An ending business event (marked `E`) terminates the object's life (Snoeck, p. 64). The object enters the final state and is considered "dead" — no further events apply. Snoeck makes the important point (p. 53) that an object does not need to be physically deleted: it exists for a period of time and then ceases to be subject to change.

The transition is always from `lcStates[lcStates.length - 1]` (the last lifecycle state) to `__final`. This is consistent with the simple sequential lifecycle model. If a non-trivial FSM had multiple possible end states, each would need its own ending transition — but the current schema and test fixture assume a single terminal state.

**Implementation:**
```typescript
const lastState = lcStates[lcStates.length - 1]
smTransitions.push({ from: lastState, to: "__final", trigger: evt.name })
smActivities.push({ name: `End_${ot.name}`, kind: "end", targetType: ot.name })
```

**Relation to DEMO:** **No equivalent.** This is one of the two genuinely new rules (the other being M9). DEMO events are monotonic boolean flags — once an event occurs, it's recorded permanently. There is no concept of "ending" an object's lifecycle in DEMO because DEMO entity types don't have lifecycles in this sense. This rule is unique to MERODE and motivates the `end` activity kind extension in pimUML.

### M9 — Shared Event Participation + Propagation Rule (Future Work)

**Source:** OET entries where multiple object types participate in the same event, including `A/M` entries derived via the Propagation Rule  
**Target:** Synchronised transition triggers across multiple FSMs (one per participating object type)

This is MERODE's most distinctive feature and the one without any DEMO equivalent. In MERODE, a single business event is *shared* by all object types that participate in it. When the event `startRental` occurs, it not only creates a `Rental` object (O/C in the Rental row) but also triggers modifying behaviour in `Car` and `Person` (A/M entries derived via the Propagation Rule — Snoeck, Ch. 5.3.1, p. 114).

The Propagation Rule states: if object type B is existence-dependent on A (B depends on A), then every event that involves B also involves A with participation type M. This means the complete OET cannot be derived from just the ObjectTypes and BusinessEventTypes — it also requires the ExistenceDependency structure.

**What this would require to implement:**
1. Parse all existence dependencies to build the propagation closure
2. For each BusinessEventType, derive which additional object types participate (as M) via transitive propagation
3. Generate M-role transitions in the FSMs of those master object types

**Why not implemented:** M9 is complex and the test fixture does not model propagated events explicitly. Adding M9 would require a non-trivial change to the transformation algorithm and a richer test fixture. Given the timeline, this is documented as Future Work. The formal rule is specified here and in MerodeMappingRules.md so that the thesis chapter can present it completely even though the implementation is incomplete.

**Scope note from the proposal:** The proposal's evaluation methodology lists "business event types" as source facts for MERODE (Section 3.3). Without M9, the OET entries for master objects are Missing in the evaluation — they'll be counted against semantic completeness. This needs to be acknowledged honestly in the evaluation chapter.

---

## 5. B-Rules: pimUML → Mendix

These are Bzowski's B-rules [4], Table 11.1, with MERODE-specific extensions (B13–B16 in this prototype's numbering, corresponding to new rules not in Bzowski).

**Note on numbering:** Bzowski's table goes B1–B24. The prototype's implementation doesn't implement all 24 rules (some are only needed for derived types, constraints, etc.). The prototype numbering B1–B16 reflects what is actually implemented, not a one-to-one mapping to Bzowski's numbering. For the thesis I should reconcile these.

| ID  | pimUML source concept                         | Mendix target                                                          | Status     |
|-----|-----------------------------------------------|------------------------------------------------------------------------|------------|
| B1  | Model (top-level)                             | Mendix App + Module                                                    | ✅          |
| B2  | Class                                         | Entity (domain model)                                                  | ✅          |
| B3  | Class (isAbstract)                            | Abstract Entity                                                        | ✅          |
| B4  | Enumeration + EnumerationLiteral              | Mendix Enumeration + EnumerationValue (with English caption)           | ✅          |
| B5  | DataType                                      | Entity (no domain model equivalent, treated as entity)                 | ✅          |
| B6  | Property (isID=true)                          | Integer Attribute                                                      | ✅          |
| B7  | Property (regular)                            | String / Integer / Boolean Attribute                                   | ✅          |
| B8  | AssociationClass                              | Entity + two Associations                                              | ✅          |
| B9  | Association + multiplicities                  | Mendix Association with owner/reference settings                       | ✅          |
| B10 | Generalization                                | Mendix Generalization/Specialization                                   | ✅          |
| B11 | StateMachine (DEMO)                           | ACR Microflow + Workflow trigger                                       | ✅          |
| B12 | DEMO Region + false/true states               | Workflow with WaitForNotification activities                           | ✅          |
| B13 | MERODE StateMachine (lifecycle states)        | `<Entity>_Status` Enumeration                                         | ✅          |
| B14 | MERODE Create activity                        | `Create_<Entity>` Microflow: CreateObject + set status to first state | ✅          |
| B15 | MERODE Set activity                           | `Set_<Entity>_<Event>` Microflow: ChangeObject status to toState      | ✅          |
| B16 | MERODE End activity                           | `End_<Entity>` Microflow (stub, parameter only)                       | ⚠️ Stub     |
| —   | Overview + Detail pages for each Entity       | Mendix Pages                                                           | ✅          |

### B13 — MERODE lifecycle states → Mendix status enumeration

When a MERODE StateMachine arrives with `simple`-kind states, the agent creates a `<Entity>_Status` enumeration in the Mendix domain model. Each lifecycle state name becomes an enumeration value, with an English caption (capitalised name). A `status` attribute of this enumeration type is added to the corresponding entity.

This is the simplest way to represent lifecycle state in Mendix without using Workflows. The trade-off: Mendix Workflows are the "proper" way to model state machines, but generating Workflows for sequential MERODE FSMs requires significantly more complex SDK code (mapping lifecycle transitions to Workflow activities, handling wait nodes, etc.). The status attribute approach is simpler to implement and still makes the lifecycle state visible in the domain model and queryable in microflows.

### B14 — MERODE Create activity → Create microflow

The `Create_<Entity>` microflow:
1. Creates a new Entity object with `CreateObjectAction`
2. Sets the `status` attribute to the first lifecycle state using a `ChangeObjectAction` with a `MemberChange`

The expression for the status assignment is `<Module>.<Entity>_Status.<firstState>` (without quotes — Mendix enum expressions are unquoted references, not string literals). Getting this right took some debugging (CE0117 error from quoted expressions).

### B15 — MERODE Set activity → Change microflow

The `Set_<Entity>_<EventName>` microflow changes the `status` attribute to the `toState` of the transition. Takes the entity as a parameter and sets the status to the target state.

### B16 — MERODE End activity → End microflow (stub)

The `End_<Entity>` microflow is currently a stub: it creates a microflow with a parameter for the entity but does not implement any actual end behaviour. Options would be to archive the object, set a `deleted` flag, or soft-delete via a `status = end` assignment. Which is most appropriate depends on the Mendix application requirements and is left as application-level design. The microflow stub ensures the Mendix model doesn't have an undefined reference for the End activity but doesn't prescribe the deletion strategy.

---

## 6. Cross-Language Comparison at the PIM Level

This table shows how DEMO and MERODE source concepts map to pimUML, highlighting where they produce the same PIM constructs and where they diverge. This is the comparison the thesis needs to make the heterogeneity claim concrete.

| Concept category       | DEMO source            | MERODE source                     | pimUML target              | Same? |
|------------------------|------------------------|-----------------------------------|----------------------------|-------|
| Business object        | EntityType (declared)  | ObjectType                        | Class                      | ✅ Yes |
| Identity               | (integer ID from A3)   | ObjectType (ID from M1)           | Property (isID=true)       | ✅ Yes |
| Attribute              | AttributeType (A5)     | Attribute (M2)                    | Property                   | ✅ Yes |
| Categorical domain     | ValueType/categorical (A1) | Attribute with enum domain (M3) | Enumeration               | ✅ Similar |
| Scalar domain          | ValueType/non-cat. (A2) | Attribute with scalar domain (M3)| DataType                  | ✅ Similar |
| Relationship           | FactType / Property (A12) | ExistenceDependency (M4)       | Association                | ✅ Similar |
| Aggregation            | Aggregation fact (A11) | (no direct equivalent)            | Association with aggregation | — |
| Inheritance            | Generalisation (A10)   | (Ch. 8, not in scope)            | Generalization             | — |
| Lifecycle FSM          | Orthogonal region FSM (A6) | Sequential FSM (M5–M8)        | StateMachine               | ⚠️ **Different** |
| Creating event         | Event type (A6/A7)     | BET with role C (M6)             | Transition + Create act.   | ⚠️ Similar but context differs |
| Modifying event        | Event type (A6)        | BET with role M (M7)             | Transition + Set act.      | ⚠️ Similar but monotonic vs. sequential |
| Ending event           | (no equivalent)        | BET with role E (M8)             | Transition to final + End act. | ❌ **New in MERODE** |
| Shared event / propagation | (no equivalent)  | Propagation Rule (M9)            | Synchronised triggers       | ❌ **New in MERODE** |

The two rows marked "New in MERODE" (M8, M9) are what makes MERODE paradigmatically different from DEMO at the PIM level and justify the PIM extension. The FSM row is different but can be accommodated by the same PIM construct with different internal structure.

---

## 7. Notes for the Thesis Chapter

- The formal presentation of M-rules should follow Bzowski's format: a table with source concept, target concept, and relation to DEMO (see MerodeMappingRules.md for the full justification text).
- The cross-language comparison table (Section 6 above) can become a figure in the thesis.
- The FSM comparison (orthogonal regions vs. sequential) is the key conceptual contribution and deserves a dedicated subsection with diagrams — the DEMO FSM for `Rental` (with `startRental`/`completeRental` boolean regions) next to the MERODE FSM (with `active` state and `__initial`/`__final` pseudostates).
- The pimUML schema changes (State.kind extension, Activity.kind extension, Region.forEvent made optional) should be presented as a small diff table, not a full schema listing.
- For M9: present the formal rule even though the implementation is incomplete. The thesis explicitly allows for specifying more than is implemented, and M9 is the most academically interesting rule.
