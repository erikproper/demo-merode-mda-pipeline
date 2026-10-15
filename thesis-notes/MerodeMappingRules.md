# MERODE to pimUML: Formal Mapping Rules (M1-M9)

Derived from Snoeck (2014) [21] and Bzowski (2025) [4], analogous to Bzowski's Table 10.1 (A1-A12).

---

## 1. Table of Figures

| ID  | MERODE Source Concept                                             | pimUML Target                                                                                                                          | Reference to DEMO (Bzowski)                                          |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| M1  | ObjectType (business object with identity, attributes, lifecycle) | Class + logical identifier (integer) + StateMachine                                                                                    | analogous to A3 (equivalent structure, different lifecycle)          |
| M2  | Attribute of an ObjectType                                        | Property                                                                                                                               | equivalent to A5                                                     |
| M3  | Attribute with an enumerated or user-defined domain               | Enumeration / user-defined DataType                                                                                                    | equivalent to A1 / A2                                                |
| M4  | ExistenceDependency (dependent on main object, multiplicity)      | Directed Association (dependent on main object), multiplicities, mandatory main object side (+ optional OCL lifecycle constraint)      | analogous to A11 / A12 (richer semantics)                            |
| M5  | ObjectType Lifecycle (sequential FSM)                             | State machine with a single non-orthogonal region: initial pseudo-state, named ordered states, final state                             | fundamentally different from A3/A6; new; requires schema extension   |
| M6  | BusinessEventType, creating (C)                                   | Transition (from initial to first state) + Create activity, in the owner's FSM                                                         | analogous to A6/A7 (create), sequential context                      |
| M7  | BusinessEventType, modifying (M)                                  | Transition (state to next state) + Set activity                                                                                        | analogous to A6 (set), sequential context                            |
| M8  | BusinessEventType, terminating (E)                                | Transition (state to final state) + Terminate activity; object enters final ("dead") state                                             | fundamentally different (DEMO is monotonic, has no termination); new |
| M9  | Shared participation and event propagation (owner + main objects) | A BusinessEventType generates synchronized transition triggers in the FSM of each participating ObjectType (modifying in main objects) | fundamentally different (DEMO events belong to an entity); new       |

---

## 2. Rule-Based Justification Text

**M1 - ObjectType to Class + logical identifier + StateMachine.**
In MERODE, an object type is a business object characterized by an identity, a state described by attributes, and behavior expressed through participation in business events [21]. The structural part of this concept corresponds directly to the declared entity type in DEMO and is therefore, following Bzowski's Rule A3, translated into a pimUML class with an integer logical identifier [4]. As in A3, a state machine is attached to the class to support the object's lifecycle; however, its internal structure differs fundamentally (see M5). Reference: analogous to A3.

**M2 - Attribute to Property.**
Attributes describe the state of a MERODE object type and make the object observable [21]. They map 1:1 to pimUML properties, identical to Bzowski's Rule A5, whereby the attribute domain determines the property type. There is no semantic divergence from DEMO at this level. Reference: equivalent to A5.

**M3 - Attribute domain to Enumeration / DataType.**
If a MERODE attribute has a fixed enumerated domain, it is translated into a pimUML enumeration; if it has a user-defined scalar domain, it is translated into a user-defined DataType. This reflects Bzowski's treatment of categorical and non-categorical value types (A1, A2) [4]. MERODE does not emphasize the distinction between value types as a standalone concept; therefore, the rule is applied at the attribute domain level. Reference: equivalent to A1/A2.

**M4 - ExistenceDependency to Association.**
An existence dependency states that a dependent object type can exist only as long as its main object exists; it carries a multiplicity and induces lifecycle constraints, namely that a dependent is created after the main object and terminated before it [21]. The structural projection is a directed association from the dependent to the main object with corresponding multiplicities and a mandatory main-object side, reusing the association mechanism from Bzowski's rules A11/A12. In contrast to DEMO aggregation, the existence dependency additionally implies a referential integrity constraint across the two lifecycles. Since every well-defined EDG association either expresses an existence dependency or is reified into an object type [21], all MERODE associations are covered by this single rule. Reference: analogous to A11/A12.

**M5 - ObjectType lifecycle (FSM) to sequential StateMachine. [Core contribution]**
MERODE is explicitly lifecycle-oriented: each object type has an FSM whose states represent the successive phases of its lifecycle and whose transitions are triggered by business events [21]. This differs structurally from the state machines that Bzowski derives for DEMO: orthogonal regions, each carrying a `false`/`true` pair and imposing no specific order [4]. The semantically faithful pimUML goal is therefore a state machine with a single, non-orthogonal region containing an initial pseudo-state, named and mutually exclusive lifecycle states, and a final state. Since pimUML's `State.kind` is restricted to `{initial, false, true}`, representing arbitrary named lifecycle states requires a minimal additive PIM extension; this is precisely where MERODE's paradigm goes beyond pimUML's DEMO-influenced vocabulary. Reference: fundamentally different; new.

**M6 - Generating event (C) to transition + Create activity.**
A generating business event (C in the OET) brings an object instance into existence [21]. In the FSM of the owner object type, it is mapped to the transition that leaves the initial pseudo-state and enters the first lifecycle state, with a Create activity that instantiates the class. This is directly analogous to the Create activities that Bzowski attaches to event-type regions (A6, A7), but placed on a single sequential transition rather than within an orthogonal region. Reference: analogous to A6/A7.

**M7 - Modifying event (M) to transition + Set activity.**
A modifying business event (M) changes the state of an existing object without creating or terminating it [21]. It is mapped to a transition between two named lifecycle states, with the event as the trigger and a Set activity as the effect, analogous to the `Set<Entity><Event>` activities in A6 [4]. The key difference from DEMO: The source and target states are distinct, mutually exclusive lifecycle states rather than the `false`/`true` pair of a single Boolean. Reference: analogous to A6.

**M8 - Terminating event (E) to transition to final state + Terminate activity.**
A terminating business event (E) ends the life of an object by transitioning it to a final state; the object becomes "dead" and is no longer subject to further changes, but does not necessarily have to be physically deleted [21]. It is mapped to a transition to the final state of the object state machine, with a Terminate activity as its effect. DEMO has no counterpart: in Bzowski's model, events are monotonic Booleans that move only from `false` to `true`, so there is no concept of life cycle termination [4]. This rule is therefore genuinely novel and motivates an additional activity type in pimUML. Reference: fundamentally different; new.

**M9 - Shared participation and propagation to synchronized triggers across FSMs.**
In MERODE, a single business event is shared by all object types that are jointly involved in it, and participation is propagated from a dependent object type to each of its main objects, which are always involved (as modifiers) in the events of their dependents [21]. Consequently, a MERODE BusinessEventType does not map to a single trigger, but rather to a set of synchronized transition triggers - one in the FSM of each participating object type. DEMO offers no equivalent, since in Bzowski's model, an event type belongs to exactly one entity [4]. Reference: fundamentally different; new.

---

## 3. The FSM Decision (Option A / B / C)

Option A would map BusinessEventTypes as Boolean attributes and orthogonal regions (reusing A6). Maximum schema reuse, but semantically incorrect for MERODE. This would represent mutually exclusive lifecycle phases as independent Boolean flags and disregard both the sequence and the mutual exclusivity of a MERODE lifecycle.

Option B maps MERODE FSMs to sequential pimUML state machines. This is the only option under which the thesis can claim genuine heterogeneity handling. The cost is a minimal additive PIM extension and new PSM rules. But this cost is itself the most interesting finding: a split-PIM extensibility architecture absorbs new structural paradigms without core changes, while a new behavioral paradigm forces the split contract to evolve. Identifying this limitation directly addresses the reviewer's concern ("new CIM languages could introduce concepts not covered by existing PIM schemas") and transforms a constraint into a contribution.

Option C would document BusinessEventTypes as NotMapped. Honestly, it preserves the clean "no core changes" extensibility outcome, but it sacrifices MERODE's defining characteristic. Acceptable only as an explicit, well-reasoned scope reduction.

---

## 4. pimUML Extension Requirements

| No. | Construct                         | Change                                                                                                                           | Type                                     |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `State.kind`                      | Extension of `{initial, false, true}` to include named lifecycle states (e.g., `simple` with `name`, plus initial/final markers) | additive, existing DEMO usage unaffected |
| 2   | `Activity.kind`                   | Addition of an `end`/`terminate` type or modeling of termination via a UML final state                                           | additive                                 |
| 3   | `Region`                          | No change; a single non-orthogonal region is already expressible                                                                 | no change                                |
| 4   | `merode-schema.json` (input side) | Extension to include FSM data: states, transitions, and C/M/E classification for each BusinessEventType                          | mandatory regardless of A/B/C            |

Points 1 and 2 are minor and part of the contribution. Point 4 is mandatory for every option. The more extensive work involves the new PSM rules for sequential lifecycles in Mendix - I specified and implemented these (B13-B16). Anything beyond that remains Future Work with an explicitly stated boundary.

---

## 5. Rent-A-Car Validation

Source model (MERODE): `mda-agents/tests/rent-a-car-merode.json`

ObjectTypes: `Car`, `Branch`, `Person`, `Rental`, `RentalLine`, `Invoice`. DomainTypes: `CarGroup` (categorical), `MoneyAmount` (non-categorical). ExistenceDependencies: Rental->Car, Rental->Person, Rental->Branch, RentalLine->Rental, Invoice->RentalLine (3-hop chain).

**Object-Event Table (complete, including M9 transitive):**

| Event               | Car | Branch | Person | Rental | RentalLine | Invoice |
| ------------------- | --- | ------ | ------ | ------ | ---------- | ------- |
| registerCar         | O/C |        |        |        |            |         |
| updateCarMileage    | O/M |        |        |        |            |         |
| deregisterCar       | O/E |        |        |        |            |         |
| openBranch          |     | O/C    |        |        |            |         |
| closeBranch         |     | O/E    |        |        |            |         |
| registerPerson      |     |        | O/C    |        |            |         |
| updatePersonDetails |     |        | O/M    |        |            |         |
| deregisterPerson    |     |        | O/E    |        |            |         |
| startRental         | A/M | A/M    | A/M    | O/C    |            |         |
| extendRental        | A/M | A/M    | A/M    | O/M    |            |         |
| payDeposit          | A/M | A/M    | A/M    | O/M    |            |         |
| returnCar           | A/M | A/M    | A/M    | O/M    |            |         |
| payInvoice          | A/M | A/M    | A/M    | O/M    |            |         |
| completeRental      | A/M | A/M    | A/M    | O/E    |            |         |
| addRentalLine       | A/M | A/M    | A/M    | A/M    | O/C        |         |
| updateRentalLine    | A/M | A/M    | A/M    | A/M    | O/M        |         |
| removeRentalLine    | A/M | A/M    | A/M    | A/M    | O/E        |         |
| issueInvoice        | A/M | A/M    | A/M    | A/M    | A/M        | O/C     |
| markInvoicePaid     | A/M | A/M    | A/M    | A/M    | A/M        | O/M     |
| closeInvoice        | A/M | A/M    | A/M    | A/M    | A/M        | O/E     |

The A/M entries result from **transitive propagation** across the entire EDG envelope: RentalLine->Rental (1-hop), Invoice->RentalLine->Rental (2-hop), Invoice->RentalLine->Rental->{Car,Branch,Person} (3-hop). The implementation calculates the transitive closure of the EDG (`allTransitiveDependents()`); each event of a transitive dependent is materialized at every lifecycle state of the master - for Rental (4 intermediate states), this results in 4 self-transitions per propagated event instead of one.

**Resulting pimUML class diagram (M1-M4):**

- `Car`: Class, `CarID: Integer (isID)`, `licensePlate: String`, `group: CarGroup`, `mileage: Integer`
- `Branch`: Class, `BranchID: Integer (isID)`, `name: String`, `city: String`
- `Person`: Class, `PersonID: Integer (isID)`, `fullName: String`, `email: String`
- `Rental`: Class, `RentalID: Integer (isID)`, `startingDay: String`, `endingDay: String`, `carGroup: CarGroup`, `depositAmount: MoneyAmount`, `invoiceAmount: MoneyAmount`
- `RentalLine`: Class, `RentalLineID: Integer (isID)`, `quantity: Integer`, `description: String`
- `Invoice`: Class, `InvoiceID: Integer (isID)`, `amount: MoneyAmount`, `paidOn: String`
- Enumeration: `CarGroup` [economy, compact, luxury]
- DataType: `MoneyAmount`
- Associations: `RentalDependsOnCar` (Rental 0.._ -> Car 1..1), `RentalDependsOnPerson` (Rental 0.._ -> Person 1..1), `RentalDependsOnBranch` (Rental 0.._ -> Branch 1..1), `RentalLineDependsOnRental` (RentalLine 0.._ -> Rental 1..1), `InvoiceDependsOnRentalLine` (Invoice 0..\* -> RentalLine 1..1)

**Resulting pimUML, state machines (M5-M9):**

- `SM_Car` / `SM_Branch` / `SM_Person`: one direct C->M->E sequence each (`registerCar`/`openBranch`/`registerPerson` -> ... -> `deregisterCar`/`closeBranch`/`deregisterPerson`), plus 12 propagated self-transitions (6 Rental, 3 RentalLine, 3 Invoice events; M9, 1- to 3-hop)
- `SM_Rental`: sequential 4-state lifecycle `__initial -[startRental]-> active -[payDeposit]-> depositPaid -[returnCar]-> returned -[payInvoice]-> invoicePaid -[completeRental]-> __final`, plus self-transition `extendRental` to `active`; plus 6 propagated events (3 RentalLine events, 3 Invoice events) × 4 states = 24 self-transitions (M9, 1- or 2-hop)
- `SM_RentalLine`: `__initial -[addRentalLine]-> active -[updateRentalLine]-> active (self) -[removeRentalLine]-> __final`; plus 3 propagated Invoice events as self-transitions (M9, 1-hop)
- `SM_Invoice`: `__initial -[issueInvoice]-> issued -[markInvoicePaid]-> paid -[closeInvoice]-> __final`; no propagated events (Invoice is the end of the EDG chain)

Validation observation: M1-M4 exactly reproduce the structural pattern that Bzowski derives for DEMO (Class + ID + Association), which confirms structural interoperability without schema modification. M5-M9 demonstrate the genuinely new MERODE concepts: sequential multi-state FSMs, termination, and transitive event propagation over a 3-hop EDG chain - including the multiplication of propagated self-transitions on a master with multiple lifecycle states (Rental). Verified against `merode-to-pim-agent.ts::transform()` (schema-valid output; see `EVAL/FRAMEWORK.md`, Section 2).
