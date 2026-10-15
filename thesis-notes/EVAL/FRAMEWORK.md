# Evaluation Framework (D6)

Working document on the planning and implementation of the evaluation (D7). The methodology follows section 3.3 of the proposal and combines the Semiotic Quality Framework [12] with the Quality Framework for Conceptual Models [14].

Four dimensions are measured: semantic completeness, semantic validity, schema validation rate and traceability coverage. Extensibility is assessed separately (EXTENSIBILITY_EVIDENCE.md).

---

## 1. Evaluation procedure

The evaluation is carried out in three phases.

The evaluation is based on two pairs of models. The first pair (Sections 2 and 3) is a rule coverage model and serves to demonstrate that every A and M rule is actually triggered. The second pair (Section 4) replicates a published third-party case model and serves to establish external validity. Both are embedded units of analysis with different burdens of proof.

In the first phase, the ground truth is extracted: all atomic statements in the source model (Rent-A-Car DEMO and MERODE) are listed. An "atomic statement" is the smallest unit of meaning in the source language. For DEMO, these are: entity types, fact types (with multiplicities), property types, value types and derivation rules. For MERODE: object types (with attributes), existence dependencies (with multiplicities), business event types (with C/M/E roles) and lifecycle states (with transition structure).

In the second phase, the pipeline is executed:

```bash
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```

The published PIM (from MQTT) and the generated Mendix model structure are recorded, as is the `_trace` array from the PIM message.

In the third phase, the output elements are classified. For each ground-truth statement, the corresponding output element is evaluated:

- **Correct (C):** present in the output model, with the correct type and structure
- **Missing (M):** not present or implicitly discarded
- **Incorrect (I):** present, but with the wrong type, structure or relationships
- **Added (A):** present in the output model, but with no counterpart in the source model; subdivided into Added_justified (structurally necessary, e.g. `__initial` pseudo-states) and Added_unjustified (superfluous additions)

This results in the following metrics: Completeness = C / (C + M + I), Validity = C / (C + I + Added_unjustified), Schema Validation Rate = always 100% or the pipeline aborts, Traceability Coverage = elements with trace links / (all elements except those explicitly marked as NotMapped).

**Verification status:** The classifications in Sections 2 and 3 are no longer based on static code analysis, but on an actual call to the production functions `demo-to-pim-agent.ts::transform()` and `merode-to-pim-agent. ts::transform()` against the current fixtures, followed by Ajv validation of the output against `pimuml-schema.json` (both outputs are schema-valid; DEMO: 108 trace entries, MERODE: 100 trace entries). These figures were confirmed on 2026-09-07 by a genuine end-to-end run through the live pipeline (`curl` POST to `https://mda.tlolab.com/api/model` from a Mac; PIM payload read via `mosquitto_sub` from the retained MQTT topic directly on the Pi; raw data archived in `EVAL/demo-pim-output.json` and `EVAL/merode-pim-output.json`): identical number of traces (108/100), identical structure (12/6 classes, 11/5 associations, 12/6 state machines, 45 M9-propagated self-transitions in MERODE). This means that the formal traceability coverage calculation (Section 6) is also now complete. The only outstanding task is the live Mendix Studio Pro check (Section 5, QR3), which must be carried out manually.

---

## 2. Ground Truth: Rent-A-Car MERODE

Source model: `mda-agents/tests/rent-a-car-merode.json`
Agent: `merode-to-pim-agent.ts`, rules M1-M9.

### Domain types (M3)

| #    | Atomic source statement                                              | Expected PIM output                    | Classification |
| ---- | -------------------------------------------------------------------- | -------------------------------------- | -------------- |
| M3-1 | DomainType: CarGroup (categorical, literals: economy/compact/luxury) | Enumeration "CarGroup" with 3 literals | Correct        |
| M3-2 | DomainType: MoneyAmount (non-categorical)                            | DataType "MoneyAmount"                 | Correct        |

### Object types (M1)

| #    | Atomic source statement | Expected PIM output                                          | Classification |
| ---- | ----------------------- | ------------------------------------------------------------ | -------------- |
| M1-1 | ObjectType: Car         | Class "Car" + Property "CarID" (Integer, isID)               | Correct        |
| M1-2 | ObjectType: Branch      | Class "Branch" + Property "BranchID" (Integer, isID)         | Correct        |
| M1-3 | ObjectType: Person      | Class "Person" + Property "PersonID" (Integer, isID)         | Correct        |
| M1-4 | ObjectType: Rental      | Class "Rental" + Property "RentalID" (Integer, isID)         | Correct        |
| M1-5 | ObjectType: RentalLine  | Class "RentalLine" + Property "RentalLineID" (Integer, isID) | Correct        |
| M1-6 | ObjectType: Invoice     | Class "Invoice" + Property "InvoiceID" (Integer, isID)       | Correct        |

### Attributes (M2)

| #     | Atomic source statement                       | Expected PIM output                                      | Classification |
| ----- | --------------------------------------------- | -------------------------------------------------------- | -------------- |
| M2-1  | Attribute: Car.licensePlate (String)          | Property "licensePlate" on Car                           | Correct        |
| M2-2  | Attribute: Car.group (CarGroup)               | Property "group" (type: "CarGroup") on Car               | Correct        |
| M2-3  | Attribute: Car.mileage (Integer)              | Property "mileage" on Car                                | Correct        |
| M2-4  | Attribute: Branch.name (String)               | Property "name" on Branch                                | Correct        |
| M2-5  | Attribute: Branch.city (String)               | Property "city" on Branch                                | Correct        |
| M2-6  | Attribute: Person.fullName (String)           | Property "fullName" on Person                            | Correct        |
| M2-7  | Attribute: Person.email (String)              | Property "email" on Person                               | Correct        |
| M2-8  | Attribute: Rental.startingDay (String)        | Property "startingDay" on Rental                         | Correct        |
| M2-9  | Attribute: Rental.endingDay (String)          | Property "endingDay" on Rental                           | Correct        |
| M2-10 | Attribute: Rental.carGroup (CarGroup)         | Property "carGroup" (type: "CarGroup") on Rental         | Correct        |
| M2-11 | Attribute: Rental.depositAmount (MoneyAmount) | Property "depositAmount" (type: "MoneyAmount") on Rental | Correct        |
| M2-12 | Attribute: Rental.invoiceAmount (MoneyAmount) | Property "invoiceAmount" (type: "MoneyAmount") on Rental | Correct        |
| M2-13 | Attribute: RentalLine.quantity (Integer)      | Property "quantity" on RentalLine                        | Correct        |
| M2-14 | Attribute: RentalLine.description (String)    | Property "description" on RentalLine                     | Correct        |
| M2-15 | Attribute: Invoice.amount (MoneyAmount)       | Property "amount" (type: "MoneyAmount") on Invoice       | Correct        |
| M2-16 | Attribute: Invoice.paidOn (String)            | Property "paidOn" on Invoice                             | Correct        |

### Existence dependencies (M4)

| #    | Atomic source statement                                                            | Expected PIM output                                                                                        | Classification |
| ---- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- |
| M4-1 | ExistenceDependency: RentalDependsOnCar (Rental 0..\* -> Car 1..1)                 | Association "RentalDependsOnCar", memberEnds: dependent(Rental,0..\*) / master(Car,1..1)                   | Correct        |
| M4-2 | ExistenceDependency: RentalDependsOnPerson (Rental 0..\* -> Person 1..1)           | Association "RentalDependsOnPerson", memberEnds: dependent(Rental,0..\*) / master(Person,1..1)             | Correct        |
| M4-3 | ExistenceDependency: RentalDependsOnBranch (Rental 0..\* -> Branch 1..1)           | Association "RentalDependsOnBranch", memberEnds: dependent(Rental,0..\*) / master(Branch,1..1)             | Correct        |
| M4-4 | ExistenceDependency: RentalLineDependsOnRental (RentalLine 0..\* -> Rental 1..1)   | Association "RentalLineDependsOnRental", memberEnds: dependent(RentalLine,0..\*) / master(Rental,1..1)     | Correct        |
| M4-5 | ExistenceDependency: InvoiceDependsOnRentalLine (Invoice 0..\* -> RentalLine 1..1) | Association "InvoiceDependsOnRentalLine", memberEnds: dependent(Invoice, 0..\*) / master(RentalLine, 1..1) | Correct        |

### Business event types (M5-M8) and lifecycle

| #     | Atomic source statement                                                                                          | Expected PIM output                                                                                                                        | Classification |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| M5-1  | BET: registerCar, C-role for Car                                                                                 | SM_Car: transition `__initial -> registered`, trigger registerCar; activity Create_Car                                                     | Correct        |
| M7-1  | BET: updateCarMileage, M-role for Car, effect: mileage (Integer)                                                 | SM_Car: Self-Transition `registered -> registered`, Trigger updateCarMileage; Activity Set_Car_updateCarMileage with typed effect          | Correct        |
| M8-1  | BET: deregisterCar, E-role for Car                                                                               | SM_Car: transition `registered -> __final`, trigger deregisterCar; Activity End_Car                                                        | Correct        |
| M5-2  | BET: openBranch, C-role for Branch                                                                               | SM_Branch: transition `__initial -> open`, trigger openBranch; Activity Create_Branch                                                      | Correct        |
| M8-2  | BET: closeBranch, E-role for Branch                                                                              | SM_Branch: transition `open -> __final`, trigger closeBranch; Activity End_Branch                                                          | Correct        |
| M5-3  | BET: registerPerson, C-role for Person                                                                           | SM_Person: transition `__initial -> registered`, trigger registerPerson; Activity Create_Person                                            | Correct        |
| M7-2  | BET: updatePersonDetails, M-role for Person, effects: fullName (String), email (String)                          | SM_Person: Self-transition `registered -> registered`, Trigger updatePersonDetails; Activity Set_Person_updatePersonDetails with 2 effects | Correct        |
| M8-3  | BET: deregisterPerson, E-role for Person                                                                         | SM_Person: transition `registered -> __final`, trigger deregisterPerson; activity End_Person                                               | Correct        |
| M5-4  | BET: startRental, C-role for Rental                                                                              | SM_Rental: transition `__initial -> active`, trigger startRental; activity Create_Rental                                                   | Correct        |
| M7-3  | BET: extendRental, M-role for Rental, fromState=active, toState=active, effect: endingDay (String)               | SM_Rental: Self-transition `active -> active`, trigger extendRental; Activity Set_Rental_extendRental with typed effect                    | Correct        |
| M7-4  | BET: payDeposit, M-role for Rental, fromState=active, toState=depositPaid, effect: depositAmount (MoneyAmount)   | SM_Rental: transition `active -> depositPaid`, trigger payDeposit; activity Set_Rental_payDeposit with typed effect                        | Correct        |
| M7-5  | BET: returnCar, M-role for Rental, fromState=depositPaid, toState=returned                                       | SM_Rental: transition `depositPaid -> returned`, trigger returnCar; Activity Set_Rental_returnCar                                          | Correct        |
| M7-6  | BET: payInvoice, M-role for Rental, fromState=returned, toState=invoicePaid, effect: invoiceAmount (MoneyAmount) | SM_Rental: transition `returned -> invoicePaid`, trigger payInvoice; activity Set_Rental_payInvoice with typed effect                      | Correct        |
| M8-4  | BET: completeRental, E-role for Rental, fromState=invoicePaid                                                    | SM_Rental: transition `invoicePaid -> __final`, trigger completeRental; Activity End_Rental                                                | Correct        |
| M5-5  | BET: addRentalLine, C-role for RentalLine                                                                        | SM_RentalLine: transition `__initial -> active`, trigger addRentalLine; activity Create_RentalLine                                         | Correct        |
| M7-7  | BET: updateRentalLine, M-role for RentalLine, effects: quantity (Integer), description (String)                  | SM_RentalLine: Self-transition `active -> active`, trigger updateRentalLine; Activity Set_RentalLine_updateRentalLine with 2 effects       | Correct        |
| M8-5  | BET: removeRentalLine, E-role for RentalLine                                                                     | SM_RentalLine: Transition `active -> __final`, trigger removeRentalLine; Activity End_RentalLine                                           | Correct        |
| M5-6  | BET: issueInvoice, C-role for Invoice                                                                            | SM_Invoice: transition `__initial -> issued`, trigger issueInvoice; activity Create_Invoice                                                | Correct        |
| M7-8  | BET: markInvoicePaid, M-role for Invoice, fromState=issued, toState=paid, effect: paidOn (String)                | SM_Invoice: transition `issued -> paid`, trigger markInvoicePaid; Activity Set_Invoice_markInvoicePaid with typed effect                   | Correct        |
| M8-6  | BET: closeInvoice, E-role for Invoice, fromState=paid                                                            | SM_Invoice: transition `paid -> __final`, trigger closeInvoice; Activity End_Invoice                                                       | Correct        |
| LC-1  | Lifecycle: Car has state "registered"                                                                            | SM_Car: State {name: "registered", kind: "simple"}                                                                                         | Correct        |
| LC-2  | Lifecycle: Branch has state "open"                                                                               | SM_Branch: State {name: "open", kind: "simple"}                                                                                            | Correct        |
| LC-3  | Life cycle: Person has the state "registered"                                                                    | SM_Person: State {name:"registered", kind:"simple"}                                                                                        | Correct        |
| LC-4  | Life cycle: Rental has the state "active"                                                                        | SM_Rental: State {name:"active", kind:"simple"}                                                                                            | Correct        |
| LC-5  | Life cycle: Rental has the state "depositPaid"                                                                   | SM_Rental: State {name:"depositPaid", kind:"simple"}                                                                                       | Correct        |
| LC-6  | Life cycle: Rental has the state "returned"                                                                      | SM_Rental: State {name:"returned", kind:"simple"}                                                                                          | Correct        |
| LC-7  | Lifecycle: Rental has the state "invoicePaid"                                                                    | SM_Rental: State {name:"invoicePaid", kind:"simple"}                                                                                       | Correct        |
| LC-8  | Lifecycle: RentalLine has the state "active"                                                                     | SM_RentalLine: State {name:"active", kind:"simple"}                                                                                        | Correct        |
| LC-9  | Lifecycle: Invoice has the state "issued"                                                                        | SM_Invoice: State {name:"issued", kind:"simple"}                                                                                           | Correct        |
| LC-10 | Lifecycle: Invoice has the state "paid"                                                                          | SM_Invoice: State {name:"paid", kind:"simple"}                                                                                             | Correct        |

The rental thus goes through a genuine multi-stage, sequential lifecycle for the first time (4 intermediate states instead of just "active") - this is the key MERODE characteristic that was not represented in the original fixture.

### Transitive event propagation (M9 - full EDG envelope)

Existence Dependency Graph (EDG), edges dependent -> master: Rental -> Car, Rental -> Person, Rental -> Branch, RentalLine -> Rental, Invoice -> RentalLine. The transitive envelope results in a 3-hop chain: Invoice (depth 3) -> RentalLine (depth 2) -> Rental (depth 1) -> {Car, Person, Branch}. `allTransitiveDependents()` collects all dependents (including indirect ones) for each master; every event of every dependent is materialised as a self-transition on **every** life-cycle state of the master (including its own `Set_<Master>_<evt>` activity).

As Car/Branch/Person each have only one state, exactly one self-transition is created there for each propagated event. Rental, however, has 4 states - every event propagated to Rental (from RentalLine or Invoice) generates 4 self-transitions there, one per state. This is a new feature compared to the previous fixture version (where Rental had only one state) and marks the first real-world test of this multi-state path in M9.

The following table summarises, for each (event source, target master) pair, how many individual events are propagated; each event in a row constitutes a separate atomic source statement:

| #     | Atomic source statement                                                                                                     | Expected PIM output                                                                                                                                        | Classification |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| M9-1  | All 6 rental events (startRental, extendRental, payDeposit, returnCar, payInvoice, completeRental) propagate to Car (1-hop) | SM*Car: 6 self-transitions `registered -> registered`, each with a matching trigger + `Set_Car*<evt>` activity                                             | Correct        |
| M9-2  | The same 6 rental events propagate to Branch (1-hop)                                                                        | SM*Branch: 6 self-transitions `open -> open` + `Set_Branch*<evt>` activities                                                                               | Correct        |
| M9-3  | The same 6 Rental events propagate to Person (1-hop)                                                                        | SM*Person: 6 self-transitions `registered -> registered` + `Set_Person*<evt>` activities                                                                   | Correct        |
| M9-4  | All 3 RentalLine events (addRentalLine, updateRentalLine, removeRentalLine) propagate to Car (2-hop, via Rental)            | SM_Car: 3 further self-transitions `registered -> registered`                                                                                              | Correct        |
| M9-5  | The same 3 RentalLine events propagate to Branch (2-hop)                                                                    | SM_Branch: 3 further self-transitions `open -> open`                                                                                                       | Correct        |
| M9-6  | The same 3 RentalLine events propagate to Person (2-hop)                                                                    | SM_Person: 3 further self-transitions `registered -> registered`                                                                                           | Correct        |
| M9-7  | The same 3 RentalLine events propagate to Rental (1-hop, direct)                                                            | SM_Rental: 3 events × 4 states = 12 self-transitions (each `active->active`, `depositPaid->depositPaid`, `returned->returned`, `invoicePaid->invoicePaid`) | Correct        |
| M9-8  | All 3 invoice events (issueInvoice, markInvoicePaid, closeInvoice) propagate to Car (3-hop, via RentalLine+Rental)          | SM_Car: 3 further self-transitions `registered -> registered`                                                                                              | Correct        |
| M9-9  | The same 3 invoice events propagate to Branch (3-hop)                                                                       | SM_Branch: 3 further self-transitions `open -> open`                                                                                                       | Correct        |
| M9-10 | the same 3 Invoice events propagate to Person (3-hop)                                                                       | SM_Person: 3 further self-transitions `registered -> registered`                                                                                           | Correct        |
| M9-11 | the same 3 Invoice events propagate to Rental (2-hop, via RentalLine)                                                       | SM_Rental: 3 events × 4 states = 12 further self-transitions                                                                                               | Correct        |
| M9-12 | the same 3 Invoice events propagate to RentalLine (1-hop, directly)                                                         | SM_RentalLine: 3 self-transitions `active -> active`                                                                                                       | Correct        |

These 12 lines summarise 45 individual (Event x Master) propagation obligations (6+6+6+3+3+3+3+3+3+3+3+3 = 45 atomic statements), which together generate 63 self-transitions in the output (12 on Car + 12 on Branch + 12 on Person + 24 on Rental + 3 on RentalLine). For the summary metric below, all 45 atomic statements count individually as "Correct" - all were verified in the actual, schema-valid Transform output.

### Auxiliary structures (Added_justified)

| Added element                                                 | Justification                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Pseudo-state `__initial` in every SM                          | Initial pseudo-state required by the pimUML StateMachine format                                |
| State `__final` in every SM                                   | Final state required by the pimUML StateMachine format                                         |
| "lifecycle" region in every SM                                | Necessary wrapper for states and transitions (no forEvent, as it is a MERODE SM)               |
| Activity Create\_<OT> for C-events                            | Semantic equivalent of the C-event at activity level; required for Mendix microflow generation |
| Activity Set*<OT>*<evt> for M-events and M9-propagated events | Semantic equivalent of the respective event; required for B15 microflow generation             |
| Activity End\_<OT> for E-events                               | Semantic equivalent of the E-event; required for B16 microflow generation                      |

These are classified as "Added_justified" and are not treated as validity errors.

### MERODE Summary

Total source statements: 2 (M3) + 6 (M1) + 16 (M2) + 5 (M4) + 20 (M5-M8) + 10 (LC) + 45 (M9) = **104**

| Metric                                   | Value     |
| ---------------------------------------- | --------- |
| Correct (C)                              | 104       |
| Missing (M)                              | 0         |
| Incorrect (I)                            | 0         |
| **Completeness** = C/(C+M+I)             | **100%** |
| Added_unjustified                        | 0         |
| **Validity** = C/(C+I+Added_unjustified) | **100%** |

---

## 3. Ground Truth: Rent-A-Car DEMO

Source model: `mda-agents/tests/rent-a-car-demo.json`
Agent: `demo-to-pim-agent.ts`, rules A1-A12.

### Value types (A1, A2, A8)

| #    | Atomic source statement                                                                      | Expected PIM output                                                                                          | Classification |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- |
| A1-1 | ValueType: CarGroup (categorical, literals: economy/compact/luxury)                          | Enumeration "CarGroup" with 3 literals                                                                       | Correct        |
| A2-1 | ValueType: MoneyAmount (non-categorical, no triggerEvent)                                    | DataType "MoneyAmount"                                                                                       | Correct        |
| A8-1 | ValueType: BookingDetail (non-categorical, triggerEvent=rentalStarted, relates: Rental, Car) | AssociationClass "BookingDetail", memberEnds: rental(Rental,0.._)/car(Car,0.._), triggerEvent: rentalStarted | Correct        |
| A8-2 | Attribute: BookingDetail.pricePerDay (Integer)                                               | Property "pricePerDay" (Integer) on BookingDetail                                                            | Correct        |
| A8-3 | Attribute: BookingDetail.notes (String)                                                      | Property "notes" (String) on BookingDetail                                                                   | Correct        |

### Entity types (A3, A4)

| #     | Atomic source statement                                                               | Expected PIM output                                                                   | Classification |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------- |
| A3-1  | EntityType: Vehicle (no parent)                                                       | Class "Vehicle" + Property "VehicleID" (Integer, isID); via A10 later isAbstract:true | Correct        |
| A3-2  | EntityType: Car (parent=Vehicle, no isDerived, no triggerEvent)                       | Class "Car" + Property "CarID" (Integer, isID); ID via A3                             | Correct        |
| A3-3  | EntityType: SpecialCar (parent=Car, triggerEvent=carRegistered, no isDerived)         | Class "SpecialCar" + Property "SpecialCarID" (Integer, isID); ID via A3 as !isDerived | Correct        |
| A3-4  | EntityType: Branch (no parent)                                                        | Class "Branch" + Property "BranchID" (Integer, isID)                                  | Correct        |
| A3-5  | EntityType: Person (no parent)                                                        | Class "Person" + Property "PersonID" (Integer, isID)                                  | Correct        |
| A3-6  | EntityType: PremiumCustomer (isDerived, parent=Person)                                | Class "PremiumCustomer" (isDerived: true); ID only assigned via A9                    | Correct        |
| A3-7  | EntityType: Rental (no parent)                                                        | Class "Rental" + Property "RentalID" (Integer, isID)                                  | Correct        |
| A3-8  | EntityType: ActiveRental (parent=Rental, triggerEvent=rentalStarted, no isDerived)    | Class "ActiveRental" + Property "ActiveRentalID" (Integer, isID); ID via A3           | Correct        |
| A3-9  | EntityType: DepositPaidRental (parent=Rental, triggerEvent=depositPaid, no isDerived) | Class "DepositPaidRental" + Property "DepositPaidRentalID" (Integer, isID); ID via A3 | Correct        |
| A3-10 | EntityType: ReturnedRental (parent=Rental, triggerEvent=carReturned, no isDerived)    | Class "ReturnedRental" + Property "ReturnedRentalID" (Integer, isID); ID via A3       | Correct        |
| A3-11 | EntityType: InvoicePaidRental (parent=Rental, triggerEvent=invoicePaid, no isDerived) | Class "InvoicePaidRental" + Property "InvoicePaidRentalID" (Integer, isID); ID via A3 | Correct        |
| A3-12 | EntityType: RentalLine (no parent)                                                    | Class "RentalLine" + Property "RentalLineID" (Integer, isID)                          | Correct        |

### Attributes (A5)

| #     | Atomic source statement                                                          | Expected PIM output                                                         | Classification |
| ----- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| A5-1  | Attribute: Vehicle.licensePlate (String)                                         | Property "licensePlate" on Vehicle                                          | Correct        |
| A5-2  | Attribute: Car.group (CarGroup)                                                  | Property "group" (type: "CarGroup") on Car                                  | Correct        |
| A5-3  | Attribute: Car.mileage (Integer)                                                 | Property "mileage" on Car                                                   | Correct        |
| A5-4  | Attribute: Branch.name (String)                                                  | Property "name" on Branch                                                   | Correct        |
| A5-5  | Attribute: Branch.city (String)                                                  | Property "city" on Branch                                                   | Correct        |
| A5-6  | Attribute: Person.fullName (String)                                              | Property "fullName" on Person                                               | Correct        |
| A5-7  | Attribute: Person.email (String)                                                 | Property "email" on Person                                                  | Correct        |
| A5-8  | Attribute: Rental.startingDay (String)                                           | Property "startingDay" on Rental                                            | Correct        |
| A5-9  | Attribute: Rental.endingDay (String)                                             | Property "endingDay" on Rental                                              | Correct        |
| A5-10 | Attribute: Rental.carGroup (CarGroup)                                            | Property "carGroup" (type: "CarGroup") on Rental                            | Correct        |
| A5-11 | Attribute: Rental.totalDays (Integer, derivationRule: "endingDay - startingDay") | DerivedProperty "totalDays" (isDerived: true, derivationRule set) on Rental | Correct        |
| A5-12 | Attribute: DepositPaidRental.depositAmount (MoneyAmount)                         | Property "depositAmount" (type: "MoneyAmount") on DepositPaidRental         | Correct        |
| A5-13 | Attribute: InvoicePaidRental.invoiceAmount (MoneyAmount)                         | Property "invoiceAmount" (type: "MoneyAmount") on InvoicePaidRental         | Correct        |
| A5-14 | Attribute: RentalLine.quantity (Integer)                                         | Property "quantity" on RentalLine                                           | Correct        |
| A5-15 | Attribute: RentalLine.description (String)                                       | Property "description" on RentalLine                                        | Correct        |

### Event types -> Boolean attributes (A6)

| #     | Atomic source statement                       | Expected PIM output                                                         | Classification |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| A6-1  | EventType: carRegistered (for Car)            | Property "carRegistered" (Boolean, defaultValue: "false") on Car            | Correct        |
| A6-2  | EventType: mileageUpdated (for Car)           | Property "mileageUpdated" (Boolean, defaultValue: "false") on Car           | Correct        |
| A6-3  | EventType: carDeregistered (for Car)          | Property "carDeregistered" (Boolean, defaultValue: "false") on Car          | Correct        |
| A6-4  | EventType: branchOpened (for Branch)          | Property "branchOpened" (Boolean, defaultValue: "false") on Branch          | Correct        |
| A6-5  | EventType: branchClosed (for Branch)          | Property "branchClosed" (Boolean, defaultValue: "false") on Branch          | Correct        |
| A6-6  | EventType: personRegistered (for Person)      | Property "personRegistered" (Boolean, defaultValue: "false") on Person      | Correct        |
| A6-7  | EventType: personUpdated (for Person)         | Property "personUpdated" (Boolean, defaultValue: "false") on Person         | Correct        |
| A6-8  | EventType: personRemoved (for Person)         | Property "personRemoved" (Boolean, defaultValue: "false") on Person         | Correct        |
| A6-9  | EventType: rentalStarted (for Rental)         | Property "rentalStarted" (Boolean, defaultValue: "false") on Rental         | Correct        |
| A6-10 | EventType: rentalExtended (for Rental)        | Property "rentalExtended" (Boolean, defaultValue: "false") on Rental        | Correct        |
| A6-11 | EventType: depositPaid (for Rental)           | Property "depositPaid" (Boolean, defaultValue: "false") on Rental           | Correct        |
| A6-12 | EventType: carReturned (for Rental)           | Property "carReturned" (Boolean, defaultValue: "false") on Rental           | Correct        |
| A6-13 | EventType: invoicePaid (for Rental)           | Property "invoicePaid" (Boolean, defaultValue: "false") on Rental           | Correct        |
| A6-14 | EventType: rentalCompleted (for Rental)       | Property "rentalCompleted" (Boolean, defaultValue: "false") on Rental       | Correct        |
| A6-15 | EventType: rentalLineAdded (for RentalLine)   | Property "rentalLineAdded" (Boolean, defaultValue: "false") on RentalLine   | Correct        |
| A6-16 | EventType: rentalLineUpdated (for RentalLine) | Property "rentalLineUpdated" (Boolean, defaultValue: "false") on RentalLine | Correct        |
| A6-17 | EventType: rentalLineRemoved (for RentalLine) | Property "rentalLineRemoved" (Boolean, defaultValue: "false") on RentalLine | Correct        |

### Fact Types -> Associations (A11, A12)

| #     | Atomic source statement                                                | Expected PIM output                                                                                                                                                      | Classification |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| A11-1 | FactType: RentalHasLines (Aggregation, Rental 1..1 / RentalLine 0..\*) | Association "RentalHasLines" (isAggregation: true), memberEnds: rental(Rental,1..1)/rentalLine(RentalLine,0..\*); A11: Property "rentalLineID" (Integer) added to Rental | Correct        |
| A12-1 | FactType: RentalInvolvesCar (Rental 0..\* / Car 1..1)                  | Association "RentalInvolvesCar", memberEnds: rental(Rental,0..\*)/car(Car,1..1)                                                                                          | Correct        |
| A12-2 | FactType: RentalMadeByPerson (Rental 0..\* / Person 1..1)              | Association "RentalMadeByPerson", memberEnds: rental(Rental,0..\*)/renter(Person,1..1)                                                                                   | Correct        |
| A12-3 | FactType: RentalPickedUpAt (Rental 0..\* / Branch 1..1)                | Association "RentalPickedUpAt", memberEnds: rental(Rental,0..\*)/branch(Branch,1..1)                                                                                     | Correct        |
| A12-4 | FactType: RentalReturnedAt (Rental 0..\* / Branch 1..1)                | Association "RentalReturnedAt", memberEnds: rental(Rental,0..\*)/branch(Branch,1..1)                                                                                     | Correct        |

### Specialisations (A7, A9, A10)

| #     | Atomic source statement                                                                            | Expected PIM output                                                                                                                                                                                                        | Classification |
| ----- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A7-1  | SpecialCar: parent=Car, triggerEventType=carRegistered                                             | EventTriggeredAssociation "SpecialCarIsACar", triggerEvent: "carRegistered", memberEnds: specialisation(SpecialCar,0..\*)/parent(Car,1..1); SM_Car state `carRegistered_true` has entryActivity "CreateSpecialCar"         | Correct        |
| A7-2  | ActiveRental: parent=Rental, triggerEventType=rentalStarted                                        | EventTriggeredAssociation "ActiveRentalIsARental", triggerEvent: "rentalStarted", memberEnds: specialisation(ActiveRental,0..\*)/ parent(Rental,1..1); entryActivity "CreateActiveRental"                                  | Correct        |
| A7-3  | DepositPaidRental: parent=Rental, triggerEventType=depositPaid                                     | EventTriggeredAssociation "DepositPaidRentalIsARental", triggerEvent: "depositPaid", memberEnds: specialisation(DepositPaidRental,0.. \*)/parent(Rental,1..1); entryActivity "CreateDepositPaidRental"                     | Correct        |
| A7-4  | ReturnedRental: parent=Rental, triggerEventType=carReturned                                        | EventTriggeredAssociation "ReturnedRentalIsARental", triggerEvent: "carReturned", memberEnds: specialisation(ReturnedRental,0..\*)/parent(Rental,1..1); entryActivity "CreateReturnedRental"                               | Correct        |
| A7-5  | InvoicePaidRental: parent=Rental, triggerEventType=invoicePaid                                     | EventTriggeredAssociation "InvoicePaidRentalIsARental", triggerEvent: "invoicePaid", memberEnds: specialisation(InvoicePaidRental,0..\*)/parent(Rental,1..1); entryActivity "CreateInvoicePaidRental"                      | Correct        |
| A9-1  | PremiumCustomer: isDerived=true, parent=Person, derivationExpression="Person.rentals->size() > 10" | DerivedAssociation "PremiumCustomerIsAPerson" (isDerived: true, derivationExpression set), memberEnds: derived(PremiumCustomer,0..\*)/parent(Person,1..1); Property "PremiumCustomerID" (Integer, isID) on PremiumCustomer | Correct        |
| A10-1 | Car: parent=Vehicle, no isDerived, no triggerEventType                                             | generalisations entry { child: "Car", parent: "Vehicle" }; Class "Vehicle" is assigned isAbstract: true                                                                                                                    | Correct        |

A10 was not activated in the previous version of the fixture (no qualifying EntityType); with the newly introduced Vehicle/Car generalisation, the rule now fires correctly and is confirmed in the verified output.

### State machines (A3/A4 - orthogonal regions)

| #    | Atomic source statement                         | Expected PIM output                                                                                                                                                                                               | Classification |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| SM-1 | Car has 3 events -> 3 orthogonal regions        | SM_Car: regions carRegistered/mileageUpdated/carDeregistered; 3 states each ({ev}\_initial, {ev}\_false, {ev}\_true) + 2 transitions; carRegistered_true has entryActivity "CreateSpecialCar" (A7)                | Correct        |
| SM-2 | Branch has 2 events -> 2 orthogonal regions     | SM_Branch: regions branchOpened/branchClosed                                                                                                                                                                      | Correct        |
| SM-3 | Person has 3 events -> 3 orthogonal regions     | SM_Person: regions personRegistered/personUpdated/personRemoved; personRegistered runs without the A7 special case                                                                                                | Correct        |
| SM-4 | Rental has 6 events -> 6 orthogonal regions     | SM_Rental: regions rentalStarted/rentalExtended/depositPaid/carReturned/invoicePaid/rentalCompleted; rentalStarted_true/depositPaid_true/carReturned_true/invoicePaid_true each have their own entryActivity (A7) | Correct        |
| SM-5 | RentalLine has 3 events -> 3 orthogonal regions | SM_RentalLine: regions rentalLineAdded/rentalLineUpdated/rentalLineRemoved                                                                                                                                        | Correct        |

### Auxiliary structures (Added_justified)

| Added element                                                                                                            | Justification                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ev}_initial` pseudo-state in each region                                                                               | Required by the pimUML StateMachine format (forEvent set to DEMO-SM)                                                                           |
| Activity `Set{ET}_{ev}` for each event                                                                                   | Semantic equivalent in the activity model; necessary for Mendix B-rules                                                                        |
| Activity `Create{Child}` for triggered specialisations                                                                   | Structural aid for A7 semantics (CreateSpecialCar, CreateActiveRental, CreateDepositPaidRental, CreateReturnedRental, CreateInvoicePaidRental) |
| Activity `Create{Derived}` for derived specialisations                                                                   | Structural aid for A9 semantics (CreatePremiumCustomer)                                                                                        |
| SM with 0 regions for Vehicle/SpecialCar/PremiumCustomer/ActiveRental/DepositPaidRental/ReturnedRental/InvoicePaidRental | Always generated per EntityType; empty because no events reference these                                                                       |
| Property "rentalLineID" on Rental (A11)                                                                                  | Structurally necessary identifier link for the aggregation composition                                                                         |

### DEMO Summary

Total source statements: 5 (A1/A2/A8) + 12 (A3 EntityTypes) + 15 (A5 Attributes) + 17 (A6 Events) + 5 (A11/A12 FactTypes) + 7 (A7/A9/A10 Specialisations) + 5 (A3/A4 SMs) = **66**

| Metric                                   | Value     |
| ---------------------------------------- | --------- |
| Correct (C)                              | 66        |
| Missing (M)                              | 0         |
| Incorrect (I)                            | 0         |
| **Completeness** = C/(C+M+I)             | **100%** |
| Added_unjustified                        | 0         |
| **Validity** = C/(C+I+Added_unjustified) | **100%** |

All 12 A-rules (A1-A12) have been triggered at least once with this version of the fixture - including A10, which did not fire in the previous version.

---

## 4. Ground Truth: Rent-A-Car Case (real-world model pair according to Bzowski)

Source models: `mda-agents/tests/rent-a-car-case-demo.json` and `mda-agents/tests/rent-a-car-case-merode.json`
PIM raw data: `EVAL/demo-case-pim-output.json` and `EVAL/merode-case-pim-output.json`

### 4.1 Purpose and distinction from the fixtures in Sections 2 and 3

The fixtures from Sections 2 and 3 are rule coverage models. They were specifically designed so that every A-rule and every M-rule fires at least once (`mda-agents/tests/README.md`). Whilst this is correct for demonstrating rule completeness, it does not serve as an argument for external validity, as the case design is conceived from the perspective of the artefact.

This second pair of models closes precisely this gap. It does not map the set of rules, but rather a published case model created by third parties: the DEMO fact model for "Rent-A-Car" from Bzowski's master's thesis [bzowski2025], Figures 6.2 to 6.4 and Appendix G, Tables G.1 to G.5. Bzowski, for his part, derives the case from Dietz and Mulder [dietz2020], Chapter 15. Rule coverage is not an objective here and is not achieved. The two model pairs are therefore two embedded units of analysis with different burdens of proof, not two variants of the same thing.

### 4.2 Deviations from the reference model

Three constructs from Bzowski's fact model cannot be expressed in this prototype's DEMO input schema. They are represented faithfully in terms of content, but with changes to their form. The deviations are listed in full so that the closeness to the reference case remains verifiable.

| Bzowski                                                                                                                | Fixture                                                                                                         | Reason                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregate entity type `{CAR GROUP} * {YEAR}` with the attributes "daily rental rate" and "standard deposit amount"     | Entity type `YearlyCarGroup` with the attributes `carGroup`, `year`, `dailyRentalRate`, `standardDepositAmount` | `demo-schema.json` does not recognise an aggregate entity type. For this exact type, Bzowski leaves the "Standard UML?" and "Mendix?" columns in Table G.1 blank; the boundary is therefore defined in the reference work itself                            |
| Value type `{YEAR}` with the attributes max rental duration, rental horizon, location fine rate, late return fine rate | Entity type `Year` with the same four attributes plus `yearNumber`                                              | Value types only carry attributes in the schema where `kind: associationClass`                                                                                                                                                                              |
| Category value type `{CAR GROUP}` without literals                                                                     | `CarGroup` with the literals economy, compact, luxury                                                     | Bzowski justifies the empty enumeration on the grounds that DEMO category value types only receive their values upon instantiation. An empty enum violates `pimuml-schema.json` (`Enumeration.literals`, `minItems: 1`) and causes the Mendix page to crash |

A fourth difference applies only to the MERODE side. Bzowski's property `the car of [rental] is [car]` explicitly has _taken rental_ as its domain and is therefore partial. In the DEMO fixture, this is preserved because the fact type `TakenRentalUsesCar` is attached to the specialisation. In the MERODE fixture, the partiality is lost because, by definition, an existence dependency is total. `RentalDependsOnCar` thus already links the vehicle to the newly created rental transaction. This is a limitation of MERODE's expressive power, not an inaccuracy in the modelling, and should be included in the discussion as a finding.

Not included in the fixture are Bzowski's derived fact specifications (duration, base charge, fine charge and the others from Dietz and Mulder, Section 15.4). Bzowski does not list them in Appendix G as attribute types, but only in the running text. The inference rules of the DEMO agent therefore remain untested in this pair and continue to be covered solely by the rule coverage model from Section 3.

### 4.3 DEMO page: atomic source statements

| Category                                                                                                                                                                                     | Number | Classification |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| Value types (A1, A2): CarGroup categorical, MoneyAmount, DayNumber, YearNumber non-categorical                                                                                               | 4      | all Correct    |
| Entity types (A3, A4): Rental, DepositPaidRental, TakenRental, ReturnedRental, InvoicePaidRental, Transport, ManagedDay, Car, Branch, Person, Employee, DrivingLicense, Year, YearlyCarGroup | 14     | all correct    |
| Attribute types (A5)                                                                                                                                                                         | 21     | all correct    |
| Fact types (A11, A12), including four instances of "Destination: Person" and four instances of "Destination: Branch"                                                                         | 14     | all Correct    |
| Event types (A6), TK01 to TK07                                                                                                                                                               | 7      | all Correct    |
| Event-triggered specialisations (A7), Diamonds 02 to 05                                                                                                                                      | 4      | all Correct    |

The classification was not carried out by visual inspection, but was checked against `EVAL/demo-case-pim-output.json` for each individual statement: the existence and type of the target element; for attributes, additionally the type reference; for fact types, role names, role targets and both cardinalities; and for specialisations, the stored trigger event.

PIM generated: 1 enumeration, 3 data types, 14 classes with 42 properties, 18 associations (14 from fact types, 4 from event-triggered specialisations), 0 generalisations, 14 state machines with 7 regions (all with `forEvent` set), 14 transitions and 11 activities (7 Set, 4 Create).

It is worth noting the zero value for generalisations. Bzowski's model contains no simple specialisations, but exclusively specialisations with event types. Rule A10 therefore does not fire even once, whereas A7 fires four times. In the rule coverage model, the weighting is exactly the opposite. This is the clearest evidence that the two pairs convey different statements.

A8 (AssociationClass; Bzowski has none), A9 (derived specialisation) and the derivation rules from A5 also remain inactive.

### 4.4 MERODE page: atomic source statements

| Category                                                                    | Number | Classification |
| --------------------------------------------------------------------------- | ------ | -------------- |
| Domain types (M3)                                                           | 4      | all Correct    |
| Object types (M1)                                                           | 10     | all Correct    |
| Attributes (M2)                                                             | 20     | all Correct    |
| Existence dependencies (M4)                                                 | 8      | all Correct    |
| Business event types (M5 to M8): 10 C-roles, 10 M-roles, 10 E-roles         | 30     | all Correct    |
| Lifecycle states (LC), including five for Rental and two for DrivingLicense | 15     | all Correct    |
| Propagation obligations (M9)                                                | 30     | all Correct    |

The M9 figure is derived from the transitive closure of the existence dependency graph: Person receives 9 events (6 from Rental, 3 from DrivingLicense), Branch 8 (6 from Rental, 2 from Transport), Car 8 (6 from Rental, 2 from Transport), Year 3 (from YearlyCarGroup) and Employee 2 (from ManagedDay). Each of these masters has exactly one life cycle state, which is why exactly one self-transition is created per event.

Unlike in the rule coverage model from Section 2, there is no multi-stage propagation chain here and no multiplication across multiple states: although "Rental" has five states, in Bzowski's case it is not dependent on anything. The 3-hop path from M9 remains covered solely by the fixture from Section 2.

PIM generated: 1 enumeration, 3 data types, 10 classes with 30 properties, 8 associations, 10 state machines, each with one region without `forEvent`, 60 transitions (10 C, 10 M, 10 E, 30 propagated) and 60 activities (10 Create, 40 Set, 10 End).

### 4.5 Auxiliary Structures (Added_justified)

DEMO: 14 identifier properties, 7 Boolean state attributes (A6), 7 regions each with a `{ev}_initial` pseudo-state as well as the states `{ev}_false` and `{ev}_true`, 7 Set activities and 4 Create activities for the A7 specialisations.

MERODE: 10 identifier properties, plus one `__initial` and one `__final` pseudo-state per state machine, together with the Create, Set and End activities.

All these elements are structurally necessary and required for Mendix generation. Added_unjustified is empty in both models.

### 4.6 Summary of the case-based model pair

| Metric                                    | DEMO       | MERODE    |
| ----------------------------------------- | ---------- | --------- |
| Atomic source statements                  | 64         | 117       |
| Correct (C)                               | 64         | 117       |
| Missing (M)                               | 0          | 0         |
| Incorrect (I)                             | 0          | 0         |
| **Completeness** = C/(C+M+I)              | **100%**  | **100%** |
| Added_unjustified                         | 0          | 0         |
| **Validity** = C/ (C+I+Added_unjustified) | **100%**  | **100%** |
| Trace entries                             | 103        | 112       |
| of which NotMapped                        | 4          | 0         |
| **Traceability Coverage**                 | **96.1%** | **100%** |

The four NotMapped entries on the DEMO page are the A7 trigger events `rentalDepositPaid`, `rentalTaken`, `rentalReturned` and `rentalInvoicePaid`, each with `targetName: "StateMachineBehavior"`. It is the same justified case as in Section 6, only with four occurrences instead of five.

### 4.7 Execution

The run took place on 2026-09-17 using the unmodified production agents `api-server.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts` and `pim-to-sql-agent.ts` against a local Mosquitto broker, as the Raspberry Pi was not accessible on the home network at that time. No lines of agent code and no schema files were modified. The PIM payloads originate from the retained MQTT messages on `model.pim.created`, read via `mosquitto_sub`, and are stored unchanged in `EVAL/demo-case-pim-output.json` and `EVAL/merode-case-pim-output.json`.

The SQL agent generated 17 `CREATE TABLE` and 1 `CREATE TYPE` statements for the DEMO model, as well as 13 `CREATE TABLE` and 11 `CREATE TYPE` statements for the MERODE model.

**Updated on 2026-09-17:** all three outstanding issues at that time - end-to-end run via the live pipeline on the Pi, proof of DDL execution against PostgreSQL 16 and the Mendix Studio Pro check - have been resolved. Section 8 sets out the results.

---

## 5. Mendix-side evaluation (schema validation rate)

After running the pipeline, I open the generated Mendix model in Studio Pro and check that there are no errors (CE prefix) and, as far as possible, no warnings (CW prefix); if there are any, I document them.

After resolving CE7247, CE0117 and CW0263, the model opens without any errors. I repeat this check after every code change; the screenshot of the Mendix error pane, showing the number and type of messages, serves as empirical evidence of the 100% SVR claim.

In addition, following the corrections made on 2026-09-14, I checked the following:

- Rental has six workflows `WF_Rental_<forEvent>` and `ACR_Rental` is listed under Entity > Event handlers as "After Create" (Commit + six WorkflowCallActions).
- CE0049 occurred in an earlier implementation state for each `WorkflowCallAction` (six times for Rental). See the clarification at the end of this section.
- When creating a Rental in the current app, all six workflows start in parallel on the same object without any errors.
- `Set_Rental_extendRental` and the propagated `Set_Rental_*` microflows (ChangeObject without Status-MemberChange) do not generate an error.

**Test carried out on 2026-09-17 (all four test units):** After each of the four live runs, the generated app was opened in Mendix Studio Pro and the error log was checked. Result for `rent-a-car-demo`, `rent-a-car-merode`, `rent-a-car-case-demo` and `rent-a-car-case-merode`: **0 errors and 0 warnings** in each case. QR3 is therefore satisfied for both CIM languages and both model pairs, including the extended fixtures (Vehicle/A10, Branch, multi-stage rental lifecycles, Invoice/3-Hop-M9). The check had to be carried out between runs because `pim-to-mendix-agent` clears the target model before each run.

**Resolved (2026-09-17):** The issue documented above - that CE0049 occurs for each WorkflowCallAction - could not be reproduced during this run, even though the rule coverage DEMO generates 17 workflows and 5 ACR microflows. The measurement is decisive, not the older note: all four apps open with 0 errors and 0 warnings. The line `[warn] CE0049: click OK once in Studio Pro`, which `pim-to-mendix-agent.ts` outputs when generating each set microflow, is a hard-coded prediction by the agent and not feedback from Studio Pro. It describes an implementation status prior to the workaround via `MicroflowParameterObject`. CE0049 is therefore no longer listed as an open limitation, but is documented in `LIMITATIONS.md` as no longer observed.

**Correction (2026-09-19):** An error list export from Studio Pro shows three CW0263 warnings (Empty enumeration value caption) for the generated module `MyFirstModule`, relating to the values `economy`, `compact` and `luxury` of the `CarGroup` enumeration. The partial finding **0 Warnings** logged above was therefore incorrect for all four units; the partial finding of 0 Errors remains valid. The cause is an asymmetry in the Mendix agent: only the path for the status enumerations (B13) set an English caption for each value, whilst the path for the business enumerations (B4) set only the name. `LIMITATIONS.md` and `DESIGN_DECISIONS.md` had already described the caption as implemented; however, this description only applied to the status path. Each of the four units contains exactly one B4 enumeration with three literals, hence exactly three warnings per unit.

The B4 path was aligned with the B13 path on 2026-09-19; both paths now generate the same English caption. The four Studio Pro tests must be repeated following a regeneration. Until then, QR3 is confirmed as having 0 errors; the requirement for 0 warnings remains open.

For future checks: only messages in the generated module count. The export also contains messages from `Atlas_Core` and `Atlas_Web_Content`, which originate from the supplied standard modules and are not pipeline artefacts. Error CE1571 (missing argument for a page parameter) arises from manually adding a Data View to a generated page and is also not a pipeline artefact, as the agent generates pages without parameters.

---

## 6. Traceability Coverage

The `_trace` array in every published PIM message contains trace entries in the format `{ sourceType, sourceName, targetType, targetName }`. To calculate traceability coverage: extract the `_trace` array from the MERODE PIM message (from the MQTT retained message or the console output), count entries where `targetType != "NotMapped"` (traced elements), count entries where `targetType == "NotMapped"` (explicitly untraceable, acceptable for A7 references), and calculate Coverage = traced / (traced + untraced).

M9 is implemented (transitive propagation). All propagated events receive a trace entry (`targetType: "Transition"`, `targetName: "<OT>.<evt> (M9 propagated)"`). There are no longer any NotMapped entries for propagated events. NotMapped entries are now only generated for explicitly skipped elements (e.g. A7-SM behaviour in the DEMO agent).

Reference values from the verified test run (Section 1): The DEMO trace contains 108 entries, the MERODE trace contains 100 entries (of which 45 are for M9-propagated self-transitions). The formal coverage calculation was performed on 2026-09-07 against the `_trace` arrays extracted via `mosquitto_sub` from the retained MQTT message (`EVAL/demo-pim-output.json`, `EVAL/merode-pim-output.json`):

- **DEMO:** 108 trace entries in total, of which 5 were `NotMapped` (all of type `StateMachineBehavior`, for the A7 trigger events `carRegistered`, `rentalStarted`, `depositPaid`, `carReturned`, `invoicePaid` - semantically justified, see above). Coverage = (108 - 5) / 108 = **95.4%**.
- **MERODE:** 100 trace entries in total, 0 `NotMapped`. Coverage = 100 / 100 = **100%**.

---

## 7. Planned structure of the evaluation chapter

I had planned the following structure for the evaluation chapter: experimental setup (case study, source models, pipeline configuration), ground-truth extraction (atomic statements for each source language in tabular form), transformation results for DEMO (classification table, completeness/validity, comparison with Bzowski's results), transformation results for MERODE (classification table, explicit mention of the multi-stage rental lifecycle and the 3-hop M9 propagation), Mendix model validation (screenshot, number of errors, SVR = 100%), traceability (coverage percentage, list of "NotMapped" elements with justifications), extensibility (Git diff when adding MERODE, reference to EXTENSIBILITY_EVIDENCE.md) and discussion (what the values mean, how the results address RQ3 and RQ4).

---

## 8. Results (verified against actual transform output)

The following figures are taken from an actual call to `demo-to-pim-agent.ts::transform()` and `merode-to-pim-agent.ts::transform()` against the current fixtures, with Ajv validation of the output against `pimuml-schema.json` (no longer estimated from static code analysis).

**DEMO (66 source statements):** All 66 statements are correctly transformed (C=66, M=0, I=0). Completeness = 100%, Validity = 100%. All 12 A-rules are actually triggered at least once, including A10 (Vehicle/Car generalisation), which did not fire in the previous fixture version. The output is schema-valid, with 108 trace entries.

**MERODE (104 source statements):** All 104 statements are correctly transformed (C=104, M=0, I=0). Completeness = 100%, Validity = 100%. "Rental" undergoes a genuine multi-stage sequential lifecycle (4 intermediate states) for the first time, and M9 propagates via a 3-hop chain (Invoice -> RentalLine -> Rental -> {Car, Person, Branch}) for the first time, including correct multiplication of the self-transitions across the 4 states of "Rental". The output is schema-valid, with 100 trace entries. Known limitation: M7 effects on simple attributes (e.g. `mileage: Integer` in `updateCarMileage`) are set in the B15 microflow as a parameter plus a MemberChange. Effects on DataType attributes (`depositAmount`, `invoiceAmount` of type `MoneyAmount`) receive only a string parameter, but no MemberChange, because the attribute is an association according to B5 - this is a documented B-rule restriction (LIMITATIONS.md, B15), not an M-rule restriction.

**Schema validation rate:** 100% by design - the pipeline aborts on any schema violation before publication. This claim was confirmed during this verification process itself: a previously undetected fixture error (missing `literals` array in DEMO's `CarGroup` value type) meant that the actual output did indeed fail the `pimuml-schema.json` constraint `Enumeration. literals minItems:1` - proof that the schema validation is effective, not merely an unproven assertion. After rectification (adding the literals), the output is schema-valid.

**Traceability Coverage:** DEMO 95.4% (103/108, 5 justified "NotMapped" entries), MERODE 100% (100/100, no "NotMapped" entries). The only "NotMapped" entries arise from the A7 trace entry `{ targetType: "NotMapped", targetName: "StateMachineBehavior" }`, which explicitly marks the untranslated SM trigger semantics. These are semantically justified (see Section 6).

**Live pipeline confirmation (2026-09-07):** Both of the above results were additionally verified via a real end-to-end run - a `curl` POST to `https://mda.tlolab.com/api/model` (Mac, public Cloudflare tunnel), PIM payload read via `mosquitto_sub` from the retained topic `model.pim.created` directly on the Pi (`EVAL/demo-pim-output.json`, `EVAL/merode-pim-output.json`). All structure and trace figures are identical to the direct call test run above; Completeness and Validity thus remain at 100% for both languages.

**Case-based model pair (Section 4, run from 2026-09-17):** DEMO 64 source statements, MERODE 117 source statements, with C = all, M = 0, I = 0 in each case. Completeness and validity are 100% for both languages. Traceability coverage: DEMO 96.1% (99/103, four justified "NotMapped" entries for the A7 trigger events), MERODE 100% (112/112). This pair deliberately does not activate all rules: A8, A9, A10 and the derivation rules do not fire because Bzowski's fact model does not contain the relevant constructs. Conversely, A7 fires four times here instead of once. The comparison of the two pairs thus shows that the measured values do not depend on the case configuration.

### 8.1 Live pipeline run of all four test units (2026-09-17)

All four models were sent in turn to the pipeline running on the Raspberry Pi via the public endpoint `https://mda.tlolab.com/api/model`. The raw data for each run - agent logs, PIM from the retained topic and generated DDL - can be found in `EVAL/Eval_new/`. No lines of agent code and no schema files were modified.

**Identity with the direct-call runs:** the four PIM payloads read via the bus are, after removal of the bus metadata, byte-for-byte identical to the previously archived results `demo-pim-output.json`, `merode-pim-output.json`, `demo-case-pim-output.json` and `merode-case-pim-output.json`. The trace lengths remain unchanged at 108, 100, 103 and 112 entries. The completeness, validity and traceability coverage described in the sections above therefore remain valid for live operation. In particular, the previous asymmetry - whereby the case-specific model pair had only been run against a local broker - no longer applies.

**Mendix artefacts generated per run** (counted from the `+` lines in the `pim-to-mendix-agent` logs; all four runs end with `committed to branch`):

| Artefact                                             | DEMO | MERODE | DEMO Case | MERODE Case |
| ---------------------------------------------------- | ---- | ------ | --------- | ----------- |
| Entities (B2)                                        | 12   | 6      | 14        | 10          |
| DataType entities (B4)                               | 1    | 1      | 3         | 3           |
| Enumerations (B3)                                    | 1    | 1      | 1         | 1           |
| Status enums (B13)                                   | 0    | 6      | 0         | 10          |
| Attributes (B6)                                      | 42   | 19     | 29        | 18          |
| Associations from fact/dependency relationships (B9) | 11   | 5      | 18        | 8           |
| DataType associations (B5)                           | 2    | 3      | 13        | 12          |
| Total associations                                   | 13   | 8      | 31        | 20          |
| Association Class (B8)                               | 1    | 0      | 0         | 0           |
| Generalisation (B7)                                  | 1    | 0      | 0         | 0           |
| Microflows (B14-B16)                                 | 23   | 65     | 11        | 60          |
| ACR microflows (B12)                                 | 5    | 0      | 3         | 0           |
| Workflows (B11)                                      | 17   | 0      | 7         | 0           |
| Pages                                                | 12   | 6      | 14        | 10          |

The association figures correspond to the PIM figures in sections 2 to 4.
The two association rows are disjoint and do not overlap - an earlier
version of this table labelled the first row as "total" and the second as "of which",
which resulted in the total figure being too low by the number of DataType associations. The "total" row corresponds
to the foreign key figures in the DDL in Section 8.2 (8, 31 and 20 for MERODE,
DEMO Case and MERODE Case; for the rule coverage DEMO, the foreign keys are higher due to
generalisation and the association class).

**Note regarding the figures in this table:** they have been counted from the log of the `pim-to-mendix-agent`
; the agent is therefore reporting its own view there. Two counting conventions in the log must
be noted: the line "Attribute (B6)" does not contain the status attributes from B13, and
the agent logs the two Member-End associations and the attributes of an Association
class not individually, but only the association class itself. Section 8.1.1 resolves both
against the target state read back. It is worth noting that the case-based DEMO model **does not** generate a generalisation, because all four derived Rental types carry a trigger event and thus trigger A7 instead of A10.

**QR3:** All four apps open in Mendix Studio Pro with 0 errors (Section 5). The additional requirement of 0 warnings has been pending since the correction on 2026-09-19 and must only be re-checked following a re-generation.

#### 8.1.1 Independent cross-check by reading back the target model (2026-09-17)

The figures in Section 8.1 are taken from the log of the generating agent. To make them independent of this
self-reported data, the target state was read back from the Team Server after each run in read-only mode via the
Mendix Platform SDK (`mda-agents/tests/dump-mendix-domain.ts`,
references `EVAL/Eval_new/<Model>.mendix.json`). The read-back process does not write to the app.

| Artefact (retrieved) | DEMO | MERODE | DEMO Case | MERODE Case |
| -------------------- | ---- | ------ | --------- | ----------- |
| Entities             | 14   | 7      | 17        | 13          |
| Attributes           | 44   | 25     | 29        | 28          |
| Associations         | 15   | 8      | 31        | 20          |
| Generalisations      | 1    | 0      | 0         | 0           |
| Enumerations         | 1    | 7      | 1         | 11          |
| Microflows           | 28   | 65     | 14        | 60          |
| Workflows            | 17   | 0      | 7         | 0           |
| Pages                | 12   | 6      | 14        | 10          |

Any discrepancies with Section 8.1 are fully explained by the two
counting conventions mentioned there and cancel each other out mathematically. Entities are, in the
reverse read, the sum of B2, B4 and the association class; enumerations are the sum of B3 and
B13; microflows are the sum of B14-B16 and B12. The number of attributes in the rule-coverage MERODE
is six higher, and that of the case-based MERODE is ten higher - exactly by the number of status attributes
from B13. In the rule-coverage DEMO, the number of attributes and associations is two higher in each case, exactly
by the number of artefacts from the association class `BookingDetail` that were not logged. The
association count of 15 is therefore the actual value for this model, not the 13 from the log.

**Content verification against the input models:** the models retrieved were also
verified not against the PIM, but against the DEMO and MERODE input models respectively
(`mda-agents/tests/check-mendix-against-input.ts`), thereby verifying the entire chain CIM -> PIM ->
PSM is verified, rather than just its final step. The following are checked: entities, attribute names and
types, default values, enum literals including their order, generalisations, status enums, pages,
behavioural artefacts and the direction of each individual association - in Mendix, the
`parent` side of a reference holds the reference, so it must be the "many" side of the CIM model.

| Study unit  | Exams passed | Discrepancies | Justified omissions |
| ----------- | ------------ | ------------- | ------------------- |
| DEMO        | 104          | 0             | 1                   |
| MERODE      | 73           | 0             | 0                   |
| DEMO Case   | 99           | 0             | 0                   |
| MERODE Case | 112          | 0             | 0                   |

Not a single association is inverted; there is no input element without a counterpart in Mendix
and no generated artefact without an origin in the input model. The only justified omission
is the derived attribute `Rental.totalDays` from the rule coverage DEMO, for which no
OCL equivalent is generated in Mendix. In all four runs, the checker also reports the page
`Rental_Detail`, which the agent neither creates nor removes - it originates from an earlier
manual edit of the module and is not included in the page counts above.

### 8.2 Verification of the generated DDL against PostgreSQL 16

The four DDL files generated by the `pim-to-sql-agent` were imported, one at a time, into their own empty databases within a disposable container (`postgres:16-alpine`) using `psql -v ON_ERROR_STOP=1`. All four ran without errors. Subsequently, a check was carried out against the system catalogue to verify that the objects had actually been created - a more robust form of verification than simply the absence of an error message.

| DDL                                  | Tables | Enum types | Foreign keys |
| ------------------------------------ | ------ | ---------- | ------------ |
| `rent_a_car_demo_pim_uml.sql`        | 14     | 1          | 16           |
| `rent_a_car_merode_pim_uml.sql`      | 7      | 7          | 8            |
| `rent_a_car_case_demo_pim_uml.sql`   | 17     | 1          | 31           |
| `rent_a_car_case_merode_pim_uml.sql` | 13     | 11         | 20           |

The table and enum numbers correspond to the statements in the scripts, and every `REFERENCES` expression has been created as a constraint in the database. This also confirms S12, the topological sorting of the `CREATE TABLE` order according to Kahn's algorithm: if the order were incorrect, a table would be created before its target and `psql` would abort.

Regarding the outstanding question about CE0049 previously noted here, see the clarification at the end of Section 5.
