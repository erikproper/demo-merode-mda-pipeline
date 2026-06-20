# Evaluation Framework (D6)

Notes on how to run and document the evaluation (D7). The evaluation follows the methodology described in the proposal (Section 3.3), which combines the Semiotic Quality Framework [12] and the Quality Framework for Conceptual Models [14].

The goal is to measure four dimensions: semantic completeness, semantic validity, schema validation rate, and traceability coverage. Extensibility is assessed separately (see EXTENSIBILITY_EVIDENCE.md).

---

## 1. Evaluation Procedure Overview

The evaluation has three phases:

**Phase 1 — Ground truth extraction.** List all atomic statements in the source model (the Rent-A-Car MERODE and DEMO models). An "atomic statement" is the smallest unit of meaning in the source language. For DEMO these are: entity types, fact types (with multiplicities), property types, value types, and derivation rules. For MERODE these are: object types (with attributes), existence dependencies (with multiplicities), business event types (with C/M/E role), and lifecycle states (with transition structure).

**Phase 2 — Transformation execution.** Run the pipeline end-to-end:
```bash
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```
Capture the published PIM (from MQTT) and the generated Mendix model structure. Also capture the `_trace` array from the PIM message.

**Phase 3 — Classification.** For each ground-truth statement, classify the corresponding output element as:
- **Correct** (C): present in the output with the correct type and structure
- **Missing** (M): not present in the output at all, or silently dropped
- **Incorrect** (I): present but with wrong type, wrong structure, or wrong relationships
- **Added** (A): present in the output but without a corresponding source element — subdivided into Added_justified (structurally necessary, e.g. `__initial` pseudostates) and Added_unjustified (spurious additions)

Then compute:
- Completeness = C / (C + M + I)
- Validity = C / (C + I + Added_unjustified)
- Schema Validation Rate = always 100% or pipeline aborts
- Traceability Coverage = elements with trace links / (all elements excluding explicitly NotMapped)

---

## 2. Ground Truth: Rent-A-Car MERODE

Source model: `mda-agents/tests/rent-a-car-merode.json`

### Object types (M1, M2)

| Statement | Expected PIM output | Classification |
|-----------|--------------------|----|
| ObjectType: Rental | Class "Rental" + Property "RentalID" (Integer, isID) | to be assessed |
| ObjectType: Car | Class "Car" + Property "CarID" (Integer, isID) | to be assessed |
| ObjectType: Person | Class "Person" + Property "PersonID" (Integer, isID) | to be assessed |
| Attribute: Rental.startingDay (String) | Property "startingDay" on Rental | to be assessed |
| Attribute: Rental.endingDay (String) | Property "endingDay" on Rental | to be assessed |
| Attribute: Car.licensePlate (String) | Property "licensePlate" on Car | to be assessed |
| Attribute: Person.name (String) | Property "name" on Person | to be assessed |

### Existence dependencies (M4)

| Statement | Expected PIM output | Classification |
|-----------|--------------------|----|
| ExistenceDependency: Rental→Car (0..* : 1..1) | Association "RentalDependsOnCar" with correct multiplicities | to be assessed |
| ExistenceDependency: Rental→Person (0..* : 1..1) | Association "RentalDependsOnPerson" with correct multiplicities | to be assessed |

### Business event types and lifecycle (M5–M8)

| Statement | Expected PIM output | Classification |
|-----------|--------------------|----|
| BET: startRental, role C for Rental | SM_Rental: transition __initial→active, trigger startRental | to be assessed |
| BET: completeRental, role E for Rental | SM_Rental: transition active→__final, trigger completeRental | to be assessed |
| BET: registerCar, role C for Car | SM_Car: transition __initial→registered, trigger registerCar | to be assessed |
| BET: registerPerson, role C for Person | SM_Person: transition __initial→registered, trigger registerPerson | to be assessed |
| Lifecycle: Rental has state "active" | SM_Rental: State {name:"active", kind:"simple"} | to be assessed |
| Lifecycle: Car has state "registered" | SM_Car: State {name:"registered", kind:"simple"} | to be assessed |
| Lifecycle: Person has state "registered" | SM_Person: State {name:"registered", kind:"simple"} | to be assessed |

### Propagated events (M9 — not implemented)

These will be **Missing** in the current implementation:

| Statement | Expected PIM output | Expected classification |
|-----------|--------------------|----|
| BET: startRental, A/M for Car (propagated) | M-transition in SM_Car triggered by startRental | **Missing** |
| BET: startRental, A/M for Person (propagated) | M-transition in SM_Person triggered by startRental | **Missing** |
| BET: completeRental, A/M for Car (propagated) | M-transition in SM_Car triggered by completeRental | **Missing** |
| BET: completeRental, A/M for Person (propagated) | M-transition in SM_Person triggered by completeRental | **Missing** |

These 4 Missing elements will reduce semantic completeness. The thesis should acknowledge this and connect it to the M9 limitation.

### Auxiliary structures (Added_justified)

These appear in the PIM output but have no direct source counterpart. They are structurally necessary:

| Added element | Justification |
|--------------|---------------|
| State `__initial` in each SM | Required by pimUML StateMachine structure (initial pseudostate) |
| State `__final` in each SM | Required by pimUML StateMachine structure (final state) |
| Region "lifecycle" in each SM | Required wrapper for states and transitions |

These count as Added_justified and are excluded from the validity penalty.

---

## 3. Ground Truth: Rent-A-Car DEMO

Source model: `mda-agents/tests/rent-a-car-mock.json`

*(This section to be completed when running the regression evaluation. The DEMO evaluation follows the same structure as Bzowski's Table 10.1.)*

Statements to evaluate:
- EntityTypes (A3): Car, Person, Rental (→ Classes + IDs)
- FactTypes / Associations (A12): Car-Rental, Person-Rental relationships
- EventTypes (A6): relevant events → boolean regions in FSMs
- AttributeTypes (A5): attributes on entity types

Expected result: all previously working DEMO elements remain Correct after the MERODE additions. Any regression here would be critical.

---

## 4. Mendix-Side Evaluation (Schema Validation Rate)

After the pipeline runs, open the generated Mendix model in Mendix Studio Pro and check:
- Zero errors (CE-prefixed)
- Ideally zero warnings (CW-prefixed), or document any remaining warnings

**Known clean state:** After fixing CE7247, CE0117, and CW0263, the model should open without errors. Run this check after any code change.

**Documentation:** Screenshot the Mendix model error panel and record the count and type of any issues. This is the empirical evidence for the 100% Schema Validation Rate claim.

---

## 5. Traceability Coverage

The `_trace` array in each published PIM message records trace entries as `{ sourceType, sourceName, targetType, targetName }`. To compute Traceability Coverage:

1. Extract the `_trace` array from the MERODE PIM message (can be read from the MQTT retained message or from console logs)
2. Count entries with `targetType != "NotMapped"` — these are traced elements
3. Count entries with `targetType == "NotMapped"` — these are explicitly untraced (acceptable for M9)
4. Coverage = traced / (traced + untraced)

For the current Rent-A-Car fixture, all M9 events will have `targetType: "NotMapped"` because M9 is not implemented. These are explicitly documented as out of scope and should be presented with an explicit justification in the thesis rather than silently excluded from the count.

---

## 6. Presentation Plan for the Thesis

The evaluation chapter (Chapter X) should follow this structure:

1. **Setup**: describe the case study (Rent-A-Car), the source models (DEMO and MERODE variants), and the pipeline configuration
2. **Ground truth extraction**: list all atomic statements for each source language (Tables similar to Section 2 above)
3. **Transformation results for DEMO**: classification table, completeness/validity scores, comparison with Bzowski's expected output
4. **Transformation results for MERODE**: classification table, completeness/validity scores, explicit acknowledgement of M9 Missing elements
5. **Mendix model validation**: screenshot, error count, schema validation rate = 100%
6. **Traceability**: coverage percentage, list of NotMapped elements with justifications
7. **Extensibility**: present the `git diff` from adding MERODE, reference EXTENSIBILITY_EVIDENCE.md
8. **Discussion**: what the scores mean, what the limitations imply for the research questions, how the results answer RQ3 and RQ4

---

## 7. Expected Scores (Pre-Evaluation Estimate)

Before running the formal evaluation, here's my estimate based on what I know about the implementation:

**DEMO — all four metrics:** Should be very close to Bzowski's reported results. If anything diverged, it would show up as a regression in the DEMO pipeline.

**MERODE — Semantic Completeness:** With M9 missing (4 propagated event participations), completeness will be somewhat below 100%. A rough estimate: 15 source statements, 4 Missing (the M9 propagations) → completeness ≈ 73%. This is an honest result: the system implements M1–M8 correctly but not M9.

**MERODE — Semantic Validity:** High, possibly 100% if no incorrect elements are found. The known issues (CE7247, CE0117, CW0263) are fixed.

**Schema Validation Rate:** 100% by design — the pipeline aborts on any validation error.

**Traceability Coverage (excluding NotMapped):** Should be close to 100% since every mapped rule produces a trace entry. The 4 M9 events produce `NotMapped` entries.

**Extensibility:** The MERODE integration changed `pim-to-mendix-agent.ts` (new B-rules) and `pimuml-schema.json` (additive extension). The third-agent experiment will determine whether the claim holds more cleanly for the ER language.
