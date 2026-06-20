# MERODE → pimUML — Formal Mapping Rules (M1–M9)

_Hergeleitet aus Snoeck (2014) [21] und Bzowski (2025) [4], analog zu Bzowskis Tabelle 10.1 (A1–A12). Die Regel- und Begründungstexte sind auf Englisch gehalten, damit sie direkt ins (englische) Theoriekapitel übernommen werden können._

---

## 1. Mapping table

| ID     | MERODE source concept                                             | pimUML target                                                                                                                | Relation to DEMO (Bzowski)                                          |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **M1** | ObjectType (business object with identity, attributes, lifecycle) | Class + logical identifier (Integer) + StateMachine                                                                          | similar to A3 (structure equivalent, lifecycle differs)             |
| **M2** | Attribute of an ObjectType                                        | Property                                                                                                                     | equivalent to A5                                                    |
| **M3** | Attribute over an enumerated / user-defined domain                | Enumeration / user-defined DataType                                                                                          | equivalent to A1 / A2                                               |
| **M4** | ExistenceDependency (dependent → master, multiplicity)            | Directed Association (dependent → master), multiplicities, mandatory master end (+ optional OCL lifecycle constraint)        | similar to A11 / A12 (richer semantics)                             |
| **M5** | ObjectType lifecycle (sequential FSM)                             | StateMachine with a single non-orthogonal Region: initial pseudostate, named ordered states, final state                     | **genuinely different** from A3/A6 — NEW; requires schema extension |
| **M6** | BusinessEventType, creating (C)                                   | Transition (initial → first state) + Create activity, in the owner's FSM                                                     | similar to A6/A7 (create), sequential context                       |
| **M7** | BusinessEventType, modifying (M)                                  | Transition (state → next state) + Set activity                                                                               | similar to A6 (set), sequential context                             |
| **M8** | BusinessEventType, ending (E)                                     | Transition (state → final state) + terminate activity; object enters final ("dead") state                                    | **genuinely different** (DEMO is monotonic, has no ending) — NEW    |
| **M9** | Shared participation & event propagation (owner + masters)        | One BusinessEventType → synchronized transition triggers in the FSM of every participating ObjectType (modifying in masters) | **genuinely different** (DEMO events belong to one entity) — NEW    |

---

## 2. Per-rule justification (theory-chapter ready)

**M1 — ObjectType → Class + logical identifier + StateMachine.**
In MERODE an object type is a business object characterised by an identity, a state described through attributes, and behaviour expressed through its participation in business events [21]. The structural part of this concept corresponds directly to the declared entity type of DEMO and is therefore translated, following Bzowski's rule A3, to a pimUML Class equipped with an integer logical identifier [4]. As in A3, a state machine is attached to the class to carry the object's lifecycle; its internal structure, however, differs fundamentally (see M5). _Relation: similar to A3._ _(Note: the current implementation maps ObjectType → Class but omits the identifier; M1 adds it for parity with A3.)_

**M2 — Attribute → Property.**
Attributes describe the state of a MERODE object type and make the object observable [21]. They map one-to-one onto pimUML Properties, identically to Bzowski's rule A5, with the attribute's domain determining the property type. No semantic divergence from DEMO arises at this level. _Relation: equivalent to A5._

**M3 — Attribute domain → Enumeration / DataType.**
Where a MERODE attribute ranges over a fixed enumerated domain it is translated to a pimUML Enumeration, and where it ranges over a user-defined scalar domain it is translated to a user-defined DataType, mirroring Bzowski's treatment of categorical and non-categorical value types (A1, A2) [4]. MERODE does not foreground the value-type distinction that DEMO does, so the rule is applied at the level of the attribute domain rather than as an independent first-class concept. _Relation: equivalent to A1/A2._

**M4 — ExistenceDependency → Association.**
An existence dependency states that a dependent object type can only exist while its master exists; it carries a multiplicity and induces lifecycle constraints, namely that a dependent is created after, and ended before, its master [21]. The structural projection of this concept is a directed association from dependent to master with the corresponding multiplicities and a mandatory master end, reusing the association mechanism of Bzowski's rules A11/A12. Unlike DEMO aggregation, the existence dependency additionally implies a referential-integrity constraint over the two lifecycles, which may be captured as an OCL invariant on the association or documented as a derived behavioural rule. Because every well-formed EDG association either expresses existence dependency or is reified into an object type [21], all MERODE associations are covered by this single rule. _Relation: similar to A11/A12._

**M5 — ObjectType lifecycle (FSM) → sequential StateMachine. [core contribution]**
MERODE is explicitly lifecycle-oriented: each object type owns a finite-state machine whose states are the successive phases of the object's life and whose transitions are triggered by business events, constrained by a default lifecycle of creation, zero or more modifications, and ending [21]. This is structurally different from the state machines Bzowski derives for DEMO, which consist of orthogonal regions — each holding a `false`/`true` pair recording whether one monotonic event has occurred — and which deliberately impose no ordering [4]. The faithful pimUML target is therefore a state machine with a single, non-orthogonal region containing an initial pseudostate, named and mutually exclusive lifecycle states, and a final state. Because pimUML's `State.kind` is restricted to `{initial, false, true}`, representing arbitrary named lifecycle states requires a minimal additive extension of the PIM (§4); this is precisely the point at which MERODE's paradigm exceeds the DEMO-shaped vocabulary of pimUML. _Relation: genuinely different — NEW._

**M6 — Creating event (C) → transition + Create activity.**
A creating business event (marked 'C' in the object-event table) brings an object instance into existence [21]. In the owner object type's state machine it is mapped to the transition leaving the initial pseudostate and entering the first lifecycle state, with a Create activity that instantiates the class — directly analogous to the create activities Bzowski attaches to event-type regions (A6, A7), but placed on a single sequential transition rather than inside an orthogonal region. _Relation: similar to A6/A7._

**M7 — Modifying event (M) → transition + Set activity.**
A modifying business event (marked 'M') changes the state of an existing object without creating or ending it [21]. It is mapped to a transition between two named lifecycle states, carrying the event as its trigger and a Set activity as its effect, analogous to the `Set<Entity><Event>` activities of A6 [4]. The essential difference from DEMO is that source and target are distinct, mutually exclusive lifecycle states rather than the `false`/`true` pair of a single Boolean. _Relation: similar to A6._

**M8 — Ending event (E) → transition to final state + terminate activity.**
An ending business event (marked 'E') terminates an object's life by bringing it into a final state; the object becomes "dead" and is no longer subject to change, although it need not be physically deleted [21]. It is mapped to a transition into the final state of the object's state machine, with a terminate activity as its effect. DEMO has no counterpart: in Bzowski's mapping events are monotonic Booleans that only ever move from `false` to `true`, so there is no notion of ending a lifecycle [4]. This rule is therefore genuinely new and motivates an additional activity kind (or the use of a UML final state) in pimUML. _Relation: genuinely different — NEW._

**M9 — Shared participation & propagation → synchronized triggers across FSMs.**
In MERODE a single business event is shared by all object types that jointly participate in it, and participation propagates from a dependent object type to each of its masters, which always participate (as modifying) in their dependents' events [21]. Consequently one MERODE business event type maps not to a single trigger but to a set of synchronized transition triggers, one in the state machine of each participating object type, with the propagated occurrences realised as modifying transitions in the masters' state machines. DEMO offers no analogue, since in Bzowski's mapping an event type belongs to exactly one entity via specialization [4]; capturing MERODE's multiparty, propagated events is thus a distinctive requirement of the heterogeneous setting. _Relation: genuinely different — NEW._

---

## 3. The FSM / BusinessEventType decision (Option A / B / C)

**Option A — BusinessEventType → Boolean attribute + orthogonal region (reuse A6).**
Maximal schema reuse, but _semantically wrong for MERODE_. It represents mutually exclusive lifecycle phases as independent Boolean flags, discarding both the ordering and the mutual exclusivity that define a MERODE lifecycle. The MERODE agent would then validate only a DEMO-shaped reading of MERODE, which undermines the very heterogeneity claim of the thesis. Defensible only as a last-resort fallback if implementation time disappears.

**Option B — MERODE FSM → pimUML StateMachine (sequential). ✅ recommended.**
Semantically faithful and the only option under which the thesis can genuinely claim to handle a paradigmatically different language. Its cost — a minimal additive PIM extension and, downstream, new `pim → Mendix` rules — is real, but that cost is itself the most interesting finding: a shared-PIM extensibility architecture absorbs new _structural_ paradigms without core changes, while a new _behavioural_ paradigm forces the shared contract to evolve. Reporting this boundary directly answers the open reviewer concern ("new CIM languages may introduce concepts not covered by existing PIM schemas") and converts a limitation into a contribution.

**Option C — BusinessEventType → NotMapped (documented).**
Honest, and it preserves the clean "no core change" extensibility result — but it abandons MERODE's defining characteristic. The thesis would then demonstrate heterogeneity only at the structural level, exactly the weakness to avoid. Acceptable only as an explicit, well-argued scope reduction, never as the intellectual centre.

**Recommendation.** Adopt **Option B** for the formal mapping (M5–M9) and the minimal pimUML extension (§4); keep M1–M4 on the existing vocabulary. In the implementation, deliver the structural path in full and the FSM path as far as the timeline allows, demarcating clearly what is _specified_ versus _implemented_. This keeps the scientific contribution — the rules themselves — complete regardless of how much of the sequential-FSM-to-Mendix engineering lands by September.

---

## 4. pimUML extension requirements

| #   | Construct                         | Change                                                                                                                                       | Type                                      |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `State.kind`                      | extend `{initial, false, true}` to admit **named lifecycle states** (e.g. a `simple` kind with a `name`, plus initial/final markers)         | additive — existing DEMO usage unaffected |
| 2   | `Activity.kind`                   | add an `end` / `terminate` kind, **or** model ending via a UML final state reached by the ending transition                                  | additive                                  |
| 3   | `Region`                          | none — a single non-orthogonal region is already expressible; only the _usage_ differs from DEMO's orthogonal regions                        | no change                                 |
| 4   | `merode-schema.json` (input side) | extend to carry FSM data: states, transitions, and the C/M/E classification of each BusinessEventType (currently only `name` + `objectType`) | **mandatory regardless of A/B/C**         |

**Assessment.** Items 1–2 are small and belong **in the thesis** — they are part of the contribution and are needed to substantiate the heterogeneity claim. Item 4 is mandatory for any option. The heavier work — new `pim → Mendix` rules to realise sequential lifecycles in Mendix (e.g. a `status` enumeration plus guarded microflows/workflows) — should be **specified** in the thesis and implemented as far as feasible; any remainder is legitimate **Future Work**, provided the boundary is stated explicitly.

---

## 5. Rent-A-Car validation

**MERODE source model**

ObjectTypes: `Person`, `Car`, `Rental`
Attributes (illustrative): `Person{name}`, `Car{licensePlate}`, `Rental{startDate}`
ExistenceDependencies: `Rental` →dep `Person` (master), `Rental` →dep `Car` (master)

Object-Event Table:

| Event          | Rental | Person         | Car            |
| -------------- | ------ | -------------- | -------------- |
| registerPerson |        | C              |                |
| registerCar    |        |                | C              |
| startRental    | C      | M (propagated) | M (propagated) |
| completeRental | E      | M (propagated) | M (propagated) |

**Resulting pimUML — class diagram (M1–M4)**

- `Person` : Class, `personID : Integer`, `name : String`
- `Car` : Class, `carID : Integer`, `licensePlate : String`
- `Rental` : Class, `rentalID : Integer`, `startDate : DateTime`
- Association `Rental → Person` : `[Rental 0..*] —— [Person 1..1]` (existence dependency, master mandatory)
- Association `Rental → Car` : `[Rental 0..*] —— [Car 1..1]`

**Resulting pimUML — state machine diagram (M5–M9)**

- `Rental` SM (single region): `initial → (startRental / CreateRental) → [Ongoing] → (completeRental / EndRental) → [Completed ⊙ final]` — applies M5, M6, M8
- `Person` SM: `initial → (registerPerson / CreatePerson) → [Registered]`; self-transitions on `startRental` and `completeRental` as modifying (propagated) — applies M6, M9
- `Car` SM: `initial → (registerCar / CreateCar) → [Registered]`; self-transitions on `startRental`, `completeRental` as modifying (propagated) — applies M9

**Activities:** `CreatePerson` (create), `CreateCar` (create), `CreateRental` (create), `EndRental` (terminate), plus modify activities for the propagated participations.

**Modelling note.** A complete MERODE model would also require ending events for `Person` and `Car` (every object type needs a creating and an ending event [21]); they are omitted here to stay within the four given events, leaving the `Person` and `Car` lifecycles open after registration.

**Validation observation.** M1–M4 reproduce exactly the structural pattern Bzowski derives for DEMO (Class + ID + Association), confirming **structural** interoperability with no schema change. The `Rental` lifecycle, by contrast, is a genuine sequential automaton (`Ongoing → Completed`) that cannot be expressed with the `false`/`true` pair of DEMO's orthogonal regions — which concretely demonstrates the need for the M5 extension and validates the heterogeneity claim at the **behavioural** level.
