# Prototype To-Do List

As of 2026-09-17. Prioritized by relevance to the thesis (Chapters 8 and 9 require evaluation).

---

## Priority 1 - Evaluation (Blockers for Thesis Chapters 8 and 9)

- [x] **DEMO Evaluation (QR1 Completeness, QR2 Validity)** - Live run on 2026-09-07 via
      the actual pipeline (`curl` against `https://mda.tlolab.com/api/model` from a Mac,
      PIM payload read via `mosquitto_sub` from the retained MQTT topic on the Pi, archived in
      `EVAL/demo-pim-output.json`). Structure (12 classes, 11 associations, 1 enum, 1 data type,
      1 AssociationClass, 1 generalization, 12 state machines, 108 trace entries) and content
      verified against ground truth and `EVAL/FRAMEWORK.md` Section 3: C=66, M=0, I=0 -
      **Completeness 100%, Validity 100%**. Identical to the previously verified
      direct call test run. Result documented in `EVAL/FRAMEWORK.md`, Sections 1 and 8.

- [x] **MERODE Evaluation (QR1 Completeness, QR2 Validity)** - Live run on 2026-09-07
      similar to the DEMO evaluation (`EVAL/merode-pim-output.json`). Structure (6 classes,
      5 associations, 1 enum, 1 data type, 6 state machines, 100 trace entries, of which 45
      are M9-propagated self-transitions) and content checked against ground truth and `EVAL/FRAMEWORK.md`
      Section 2 verified: C=104, M=0, I=0 - **Completeness 100%, Validity 100%**. Identical
      to the previously verified direct-call test run. Result documented in `EVAL/FRAMEWORK.md`, Sections 1
      and 8.

- [x] **Second test unit: case-specific model pair (QR1, QR2, QR4)** - Run on
      2026-09-17 with `rent-a-car-case-demo.json` and `rent-a-car-case-merode.json` against the
      unmodified production agents (local broker, because the Pi was unreachable).
      DEMO: C=64, M=0, I=0 - **100% / 100%**, traceability **96.1%** (103 trace entries,
      4 NotMapped for A7 triggers). MERODE: C=117, M=0, I=0 - **100% / 100%**, traceability
      **100%** (112 trace entries, 0 NotMapped). PIM payloads archived in
      `EVAL/demo-case-pim-output.json` and `EVAL/merode-case-pim-output.json`; ground truth and
      results in `EVAL/FRAMEWORK.md`, sections 4 and 8.

- [x] **Live pipeline run of all four test units** - On 2026-09-17,
      `rent-a-car-demo`, `rent-a-car-merode`, `rent-a-car-case-demo`, and
      `rent-a-car-case-merode` were sent one after another via `https://mda.tlolab.com/api/model` against the
      pipeline running on the Pi. All four runs ended with `committed to branch`.
      The PIM payloads read via the bus are byte-for-byte identical to the previously archived
      direct-call results (Trace 108/100/103/112). This eliminates the previous asymmetry,
      where the case-specific pair had only run against a local broker. Raw logs under
      `EVAL/Eval_new/`, evaluation in `EVAL/FRAMEWORK.md` Section 8.1, including the
      Mendix artifact counts per run, which are required for Thesis Section 8.3.

- [x] **PostgreSQL execution verification for all four DDL files** - imported on 2026-09-17 against
      `postgres:16-alpine` with `ON_ERROR_STOP=1`; all four passed without errors. Cross-check
      against the system catalog: 14/7/17/13 tables, 1/7/1/11 enum types, and 16/8/31/20 foreign keys
      were indeed created. This also verifies S12 (topological sorting according to Kahn), and
      the role name collision case `TransportStartsAt`/`TransportEndsAt` in the Case-DEMO-PIM
      has been verified to run through successfully. Details: `EVAL/FRAMEWORK.md`, Section 8.2.

- [x] **Mendix Studio Pro - Schema Validation Rate (QR3, binary, must be 100%)** - checked on
      2026-09-17, for all four cases; **0 errors and 0 warnings** in each case. QR3 is thus
      met for both CIM languages and both model pairs. The test was performed between
      runs because `pim-to-mendix-agent` clears the target model before each run.
  - **Clarification (2026-09-17):** CE0049 did not occur, even though the rule coverage DEMO
    generates 17 workflows and 5 ACR microflows. The older note "per WorkflowCallAction" in
    `EVAL/FRAMEWORK.md` Section 5 was not based on feedback from Studio Pro,
    but on the line `[warn] CE0049: click OK once in Studio Pro`, which
    is hard-coded in `pim-to-mendix-agent.ts` and output when each set microflow is generated. It
    describes an implementation state prior to the workaround via `MicroflowParameterObject`.
    The decisive factor is the measurement: all four apps open with 0 errors and 0 warnings. CE0049
    is no longer listed as a limitation (`LIMITATIONS.md`, `EVAL/FRAMEWORK.md`
    Section 5). Sections 6.4.5 and 7.4.5 of the thesis still mention this error and must
    be corrected.

- [x] **Independent cross-check of the Mendix result (retrieved via the Platform SDK)** -
      The artifact counts in `EVAL/FRAMEWORK.md`, Section 8.1, came from the log of the generating
      agent itself; in other words, the agent reported its own perspective there. Completed on 2026-09-17 for
      **all four test units**; evidence in `EVAL/Eval_new/<Model>.mendix.json`,
      analysis in `EVAL/FRAMEWORK.md`, Section 8.1.1.
  - **Two scripts:** `mda-agents/tests/dump-mendix-domain.ts` reads the target state by retrieving it
    from the Team Server. `mda-agents/tests/check-mendix-against-input.ts` compares this
    dump against the **input model** rather than the PIM, thereby verifying the entire
    chain CIM -> PIM -> PSM instead of just its final step. The following are checked: entities,
    attribute names and types, default values, enum literals including their order, generalizations,
    status enums, pages, behavior artifacts (`WF_<Entity>_<Event>`,
    `Set<Entity>_<Event>`, `Create_<OT>`, `End_<OT>`, `Set_<OT>_<Event>`) and, most importantly,
    the **direction of each association** - in Mendix, the `parent` side holds the reference, so it must
    be the "many" side. Swapped sides are explicitly reported as "Foreign key is
    on the wrong entity." Exit code 1 is returned for every deviation, making this
    usable as a regression test. Procedure: `mda-agents/tests/README.md`.
  - **Result:** 104 / 73 / 99 / 112 tests passed for DEMO, MERODE, DEMO Case, and
    MERODE Case, **zero discrepancies**. No association is inverted, no input element
    is left without a corresponding element, and no Mendix artifact is left without an origin. The only justified
    omission across all four models: `Rental.totalDays` (derived, no OCL equivalent).
  - **Two counting conventions in the agent log identified:** the log line "Attribute (B6)" does not count
    the status attributes from B13 (MERODE +6, MERODE Case +10), and the agent logs the two
    Member-End associations as well as the attributes of an Association Class
    individually (DEMO +2 attributes, +2 associations). The verified value for the
    rule coverage DEMO is therefore **15 associations and 44 attributes**, not 13 and 42.
    All other numbers match the log exactly when calculated. Documented in Section 8.1.1.
  - **Corrected as follows:** The rows "Total associations (B9)" and "of which
    DataType associations (B5)" in `EVAL/FRAMEWORK.md`, Section 8.1, were not nested
    within each other but were disjoint - as a result, the total count was reported as too low. Corrected
    to 13 / 8 / 31 / 20 (log view); upon review, 15 / 8 / 31 / 20. **If the thesis includes the same
    table, it must also be corrected there.**
  - **Open issue:** The module contains a page named `Rental_Detail` that the agent does not
    generate (`pim-to-mendix-agent.ts` does not recognize `_Detail`) and which its cleanup step also
    does not remove, because it only deletes pages ending in `_Overview`. This is a remnant from
    a previous manual edit, intentionally ignored and not included in the page counts.
    Can be deleted in Studio Pro when the opportunity arises.

- [x] **Traceability Coverage (QR4)** - Calculated from the two live runs above:
      **DEMO 95.4%** (103/108, 5 justified NotMapped entries for A7-SM trigger semantics),
      **MERODE 100%** (100/100, no NotMapped entries). Results documented in `EVAL/FRAMEWORK.md`,
      Sections 6 and 8. Implemented/evaluated on 2026-09-07.

- [ ] **Test-Fidelity Gap: Offline tests do not test the actual production logic**
  - **What:** `mda-agents/tests/test-transform.ts` and `mda-agents/tests/smoke-m9-m3.ts` are
    both standalone, hand-written partial reimplementations of the respective
    transformation logic - they **do not** call the actual `transform()` functions
    in `demo-to-pim-agent.ts` or `merode-to-pim-agent.ts`, respectively. `test-transform.ts` covers only
    A3/A5/A12 (3 out of 12 A rules), not A1/A2/A4/A6-A11. `smoke-m9-m3.ts` has a
    known discrepancy (`markInvoicePaid` is incorrectly rendered as a self-transition).
    There is currently **no** test script permanently committed to the repo that validates the actual
    production logic (full A1-A12 or M1-M9 functionality) offline against the fixtures - the only complete verification to date has been performed using one-time,
    session-local disposable scripts that were not committed.
- **Why it's important:** The figures documented in `EVAL/FRAMEWORK.md` (e.g., the
  45/63-M9 propagation) have been correctly verified, but the reproducibility of this
  verification for third parties (reviewers, future developers) does not currently depend on
  a committed, repeatable test, but rather on this documentation
  itself. This poses a risk to methodological traceability (Chapter 9).
- **Next step (decision pending):** Permanently export `transform()` in `demo-to-pim-agent.ts` and
  `merode-to-pim-agent.ts` (if not already done) and write a new,
  committed test script that calls these actual functions against the current
  fixtures and validates them against `pimuml-schema.json` - as a replacement for or supplement to the
  existing smoke tests. Scope and timing (now vs. only after the live evaluations
  mentioned above) have not yet been decided.
  - **Addendum (2026-09-07, Discussion):** The live pipeline run (section above, DEMO/MERODE
    evaluation) provides stronger proof of _correctness_ because it tests the actual deployed
    `transform()` code over the actual bus, not a replica. The actual shortcoming
    is _reproducibility for third parties_: a reviewer cannot repeat the live run themselves without access to the
    Pi/Docker stack, whereas they can repeat a committed test. Second aspect:
    Regression testing for future changes to the agents (immediately shows which
    individual rule breaks, rather than just "the overall result is now different"). Consideration: only worthwhile
    if work on the agents continues - still to be decided.

- [ ] **Clarify and document QR1/QR2 scoping for the pim-to-sql agent**
  - **What:** According to `REQUIREMENTS.md` §4, QR1 (Completeness) and QR2 (Validity) are defined as
    source statement classifications for the CIM->PIM step (DEMO/MERODE -> pimUML),
    not for PSM outputs - this also applies to Mendix, whose correctness proof
    is instead based on QR3 (Schema Validation Rate / Studio Pro Check), not on
    the C/M/I classification. For SQL, the Postgres executability proof serves as the
    structural analogue to QR3. This proof has been available since 2026-09-17 for all four
    Live Pipeline DDLs (see `EVAL/FRAMEWORK.md`, Section 8.2) and is no longer limited to the
    synthetic completeness fixture `rent-a-car-pim-full.json`.
  - **What's still missing:** an explicit scoping statement in `EVAL/FRAMEWORK.md` that
    explains why the SQL agent is not evaluated using QR1/QR2. The proof of execution
    is now included there, but the methodological justification for it is not.
  - **Why it's important:** Without an explicit scoping statement in `FRAMEWORK.md`, it appears to be a
    gap when a reviewer asks why the second PSM agent was not evaluated using the same metrics
    as DEMO/MERODE - even though the answer is methodologically sound (different
    pipeline stage, different appropriate metric), it's just not written down anywhere.
  - **Next step (decision pending):** (a) minimal: add a short scoping paragraph to
    `FRAMEWORK.md` explaining why QR1/QR2 are not applied to PIM->PSM and
    referring instead to the Postgres proof of concept; (b) optional addition: run the
    run the SQL Agent explicitly against the already archived live PIM outputs (it's
    running as the `sql-agent` service on the Pi anyway and has likely already generated `.sql` files
    during the DEMO/MERODE `curl` test runs - check whether these are still available on the Pi).

---

## Priority 2 - Implementation (improves evaluation results)

- [x] **pim-to-sql-agent - PostgreSQL DDL as a second PSM output** - new agent (`mda-agents/pim-to-sql-agent.ts`) that subscribes to the same `model.pim.created` topic as the Mendix agent and generates PostgreSQL DDL from it (S1-S12, complete rule table: `thesis-notes/SqlMappingRules.md`). No existing core code modified (`bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `pimuml-schema.json` - 0 changes), actual extensibility proof for QR5 (`thesis-notes/EXTENSIBILITY_EVIDENCE.md` Section 5). Output: `mda-agents/output/<modelname>.sql`, proof of executability against a real PostgreSQL instance via disposable Docker containers (procedure: `mda-agents/tests/README.md`). Bus integration (`docker-compose.yml` service, `package.json` script) implemented on 2026-08-31.

- [x] **M9 - Event Propagation** - Propagation envelope built from EDG; self-transitions inserted into master FSMs (`Set_<Master>_<evt>` activities). Raises MERODE completeness to ~100%. Implemented 2026-08-03.
- [x] **B16 - End Microflow** - Hard delete via `DeleteObjectAction`: Parameter (entity) -> DeleteAction -> End. Design decision: physical deletion as a deliberate simplification for the prototype (DD12 in DESIGN_DECISIONS.md). Implemented 2026-08-03.
- [x] **M3 - Attribute Domains** - `merode-schema.json` extended with `domainTypes` array; `MerodeDomainType` interface in `types.ts`; categorical domains -> enumeration, non-categorical -> DataType. `CarGroup` example in the Rent-A-Car fixture. Implemented on 2026-08-03.
- [x] **Bug: duplicate Create_OT/End_OT activities** - Dedup guard in M6/M8 (`smActivities.some(...)`) prevents duplicate entries when an OT has multiple C or E events. Fixed on 2026-08-03.
- [x] **Bug: non-categorical DataType -> string fallback** - DataType-typed attributes are now implemented as associations instead of string attributes (B5). Fixed on 2026-08-03.
- [x] **DEMO/MERODE fixtures enhanced** - `rent-a-car-demo.json`/`rent-a-car-merode.json` have been expanded so that every A/M rule is triggered at least once (basis for the Priority-1 evaluation runs above). Implemented 2026-08-31.

---

## Housekeeping / Documentation Consistency

- [x] **`mda-agents/README.md` was severely out of date** - it listed only `demo-to-pim-agent.ts` as
      implemented, `pim-to-mendix-agent.ts` as "[planned]," and MERODE/SQL agents were
      completely missing; A2 was incorrectly mapped as `PrimitiveType` instead of `DataType`. Corrected
      2026-09-01; mapping tables are now maintained centrally only in `MAPPING_NOTES.md`.
- [x] **`mda-agents/tests/README.md` described an obsolete DEMO fixture** - The "Coverage"
      and "Known Deviations" sections referred to a structurally different,
      earlier fixture iteration (including entities `Year`, `RentalYear`, `ManagingDay`,
      `YearlyCarGroup`, which no longer exist in the current fixture). Corrected on 2026-09-01
      with the current, verified fixture metrics.
- [ ] **Local project note references a nonexistent `BUILD_FAHRPLAN.md`** -
      a local, unversioned note file refers to `./BUILD_FAHRPLAN.md` as
      "Detailed Construction Plan," but this file does not exist anywhere in the repo (verified via
      `find`, 2026-09-01). The planning file that is actually maintained is this one
      (`thesis-notes/PROTOTYPE_TODOS.md`). This only affects local work organization, not the
      repo itself - remove the reference when possible or update it to point to `PROTOTYPE_TODOS.md`.

---

## Future Work (no longer within the scope of this thesis)

- [ ] **Tool Integration** - Converter from real tool exports to `demo-schema.json` / `merode-schema.json`:
  - **YADM Export** - Marien will send the export format; build a converter from YADM-JSON to `demo-schema.json` if necessary.
  - **Sparx XMI** - Use Social Housing and Desperados as additional test cases; check Marien's reconstruction script.
  - **Merlin .mxp** - Analyze the format; if necessary, build a converter to `merode-schema.json`.

- [ ] **Third CIM Agent (ER Diagram)** - Originally planned as formal extensibility proof E1-E2, but replaced by the actually built `pim-to-sql-agent` (see above, Priority 2) as a real PSM-side extensibility proof (`thesis-notes/EXTENSIBILITY_EVIDENCE.md` Section 5). An additional third CIM agent would be the natural next step, but is no longer within the scope of this thesis.

- [ ] **B-new: Generic Page Content** - Currently, overview pages are generated only as an empty skeleton (name + layout + navigation entry). The following should be automatically derived from the PIM model, without hard-coding a specific example:
  - **Overview page for each entity:** DataGrid with all non-derived attributes as columns. No manual setup required.
  - **Detail page for each entity:** DataView (data source: object from navigation context) with one input widget per attribute (TextBox for string/integer, DatePicker for date, dropdown for enum attributes). Save button that executes a commit.
  - ~~**Workflow trigger button per entity with FSM**~~ - No longer applicable as of 2026-09-14: `ACR_<EntityName>` is registered as an after-create handler and commits on its own (DD13). An additional button would cause the region workflows to start twice. Original plan: Generate a "Start [EntityName] Workflow" button on the detail page that:
    1. First executes a `CommitObjectAction` (fix for "Only committed persistent objects can be used to start a workflow")
    2. Then calls the generated `ACR_<EntityName>` microflow
       The button should only be generated if region workflows (`WF_<EntityName>_<forEvent>`) exist for the entity - i.e., for DEMO entities with a `stateMachines` entry. No button for entities without an FSM.
  - **New Object Button on the Overview Page:** "New [EntityName]" button that creates an empty object, commits it, and navigates to the detail page.

  **Why:** Tested on 2026-08-21. Although the pages were technically present in the model, they were completely empty - no content, and no interaction was possible without manual setup in Studio Pro.

---

## Test command

```bash
# DEMO
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: demo" \
  -d @mda-agents/tests/rent-a-car-demo.json

# MERODE
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```
