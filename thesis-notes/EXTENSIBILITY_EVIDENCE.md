# Extensibility Evidence

Notes for the extensibility claim: can a new CIM language be added without modifying existing components? This is the binary criterion from the proposal (Section 2.3) and operationalises AR3.

These notes are in two parts: (1) evidence from the actual MERODE integration — what changed and what didn't — and (2) a plan for the formal extensibility experiment (E1–E2) where a third agent demonstrates the claim from scratch.

---

## 1. The Claim

The thesis claims the Modelling Bus architecture is extensible in the sense of ISO/IEC 25010 modifiability: adding support for a new CIM language requires only adding a new agent, without modifying any existing component.

The proposal operationalises this as a binary yes/no: does adding a third CIM agent require changes to `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts`, or the core structure of `pimuml-schema.json`?

The answer from the MERODE integration is: *mostly no, with one nuance* (the PIM schema was extended additively, and the Mendix agent required new B-rules). Whether this counts as a violation or as an expected part of the claim needs to be argued carefully in the thesis.

---

## 2. Evidence from Adding MERODE — What Changed

### New files created (purely additive, no existing file touched)
- `mda-agents/merode-to-pim-agent.ts` — the new MERODE CIM agent (entirely new)
- `mda-agents/schemas/merode-schema.json` — the MERODE CIM schema (entirely new)
- `mda-agents/tests/rent-a-car-merode.json` — test fixture for MERODE (entirely new)

### Modified files — infrastructure/shared code
- `docker-compose.yml` — one new service block added (`merode-to-pim-agent`). No existing service definitions changed.
- `.env` / environment configuration — no changes required; all configuration is via environment variables on the new container.

### Modified files — schemas and types
- `mda-agents/schemas/pimuml-schema.json`:
  - `State.kind` enum extended: `"simple"` and `"final"` added
  - `Activity.kind` enum extended: `"end"` added
  - `Region.forEvent` moved from de facto required to optional
  - All changes are additive/relaxing. DEMO-generated PIM still validates without change.

- `mda-agents/schemas/types.ts`:
  - `PimState.kind` type extended (same changes as schema)
  - `PimRegion.forEvent` made optional
  - `PimActivity.kind` extended
  - New MERODE-specific interfaces added: `MerodeObjectType`, `MerodeBusinessEventType`, `MerodeAttribute`, `MerodeExistenceDependency`, `MerodeModel`

### Modified files — downstream agent (`pim-to-mendix-agent.ts`)
This is the most sensitive file for the extensibility claim, because it's the downstream component that "should not need to change."

**Changes made:**
1. Added `isMerodeFSM()` helper function
2. Added B13–B16 rule blocks in the `applyPimToMendix` function
3. Changed from single-agent subscription to multi-agent subscription (`PIM_SOURCE_AGENTS`)
4. Added `if (isMerodeFSM(sm)) continue` guard in the Workflow generation loop

**What did NOT change in `pim-to-mendix-agent.ts`:**
- The DEMO code path (B1–B12) — zero changes
- The bus subscription mechanism — only the topic list changed
- The core `applyPimToMendix` function structure — new code was added, existing code untouched
- The structural B-rules (entity/attribute/association generation) — completely unaffected

### Modified files — `demo-to-pim-agent.ts`
**Zero changes.** The DEMO agent was completely untouched when adding MERODE.

### Modified files — `bus-client.ts`, `agent-utils.ts`
**Zero changes.** All shared infrastructure was untouched.

---

## 3. Analysis: Does This Satisfy the Extensibility Criterion?

The honest answer has three parts:

**Part 1 — The new CIM agent is purely additive.** The `merode-to-pim-agent.ts` and `merode-schema.json` are new files. Adding them required zero changes to any existing file. From a plugin architecture perspective, this is exactly the extensibility claim: adding a plugin (agent) doesn't require modifying the core. ✅

**Part 2 — The PIM schema was extended additively.** The pimUML schema is shared infrastructure — it's the contract between CIM agents and the PSM agent. Extending it for MERODE required adding new enum values and making one field optional. These are additive changes: no existing field was removed, renamed, or had its type narrowed. DEMO-generated PIMs continue to validate unchanged.

The question is whether *any* schema change counts as a violation of the extensibility criterion. I argue it does not, because the schema extension was genuinely additive — it only broadened the valid set of PIM documents. A stricter version of the criterion would be: the PIM schema is frozen and no new CIM language can introduce new PIM concepts. But this is too strict: it would require the PIM to be designed upfront for all possible future languages, which is neither feasible nor necessary. The practical criterion should be: does adding a new language require *narrowing* existing schema constraints or *breaking* the DEMO agent? Neither happened. ✅ (with acknowledgement)

**Part 3 — The PSM agent (pim-to-mendix-agent) received new code.** This is the most contentious point. The strict reading of the extensibility criterion says the downstream agent must not change at all. But this strictness conflates two different things:

- *Business logic changes* (changing how existing PIM concepts are translated to Mendix) — these would break existing behaviour and violate the claim
- *New rule additions* (adding B13–B16 for a new PIM concept that didn't exist before) — these extend the agent's capability without touching existing logic

Adding B13–B16 is more analogous to installing a new plugin in an extensible framework than to modifying existing code. The DEMO code path in the agent was not touched. Whether this distinction is convincing enough for the evaluation depends on how strictly the criterion is defined.

**Recommendation for the thesis:** Frame the extensibility criterion as "no changes to the transformation logic for existing languages" rather than "no changes to any downstream file." Present the concrete diff (what changed in each file) as evidence. The claim is satisfied under the more precise formulation and the deviation from the strictest formulation is explicitly acknowledged.

---

## 4. Lines-Changed Analysis

An approximate measure of the change cost when adding MERODE:

| File | Change type | Approx. lines changed |
|------|-------------|----------------------|
| `merode-to-pim-agent.ts` | New file | ~170 |
| `merode-schema.json` | New file | ~60 |
| `rent-a-car-merode.json` | New test fixture | ~50 |
| `pimuml-schema.json` | Additive extension | ~8 |
| `types.ts` | New types + extensions | ~45 |
| `pim-to-mendix-agent.ts` | New B-rules + helper | ~120 |
| `docker-compose.yml` | New service block | ~10 |
| `demo-to-pim-agent.ts` | **Zero** | 0 |
| `bus-client.ts` | **Zero** | 0 |
| `agent-utils.ts` | **Zero** | 0 |

**Total new code:** ~335 lines  
**Total modified existing code:** ~183 lines (almost entirely new additions within existing files, not modifications to existing logic)  
**Total unchanged core files:** `demo-to-pim-agent.ts`, `bus-client.ts`, `agent-utils.ts` — zero changes

The `git diff` for this would clearly show that the DEMO pipeline is untouched. This diff is itself a form of extensibility evidence.

---

## 5. The Third-Agent Experiment (E1–E2)

To provide clean extensibility evidence independent of the MERODE-specific details, the plan is to add a third CIM language agent. The third language should be simple enough to implement quickly (to keep the experiment focused on the architecture, not the language semantics) but different enough from DEMO and MERODE to show the pattern generalises.

### Candidate third language: Simple ER Diagram (ER-light)

A stripped-down entity-relationship diagram format with:
- `entities`: list of entity names with attributes
- `relationships`: binary relationships between entities (name, multiplicities, both ends)

This is simpler than both DEMO and MERODE (no lifecycle, no events, no existence dependency) but covers the structural part of the PIM (Classes, Properties, Associations). It's a "hello world" CIM agent.

**Predicted files needed:**
- `er-to-pim-agent.ts` (new)
- `er-schema.json` (new)
- `rent-a-car-er.json` (new test fixture)
- `docker-compose.yml` (one new service block)

**Predicted files NOT changed:**
- `demo-to-pim-agent.ts` — zero
- `merode-to-pim-agent.ts` — zero
- `pim-to-mendix-agent.ts` — zero (ER entities become pimUML Classes, which B2 already handles)
- `bus-client.ts` — zero
- `agent-utils.ts` — zero
- `pimuml-schema.json` — zero (ER concepts map to existing pimUML constructs)

If this prediction holds, it is strong evidence for the extensibility claim. The `git diff` after adding the ER agent would show only new files and the `docker-compose.yml` addition — no existing file modified.

### Evaluation of the experiment

After adding the third agent:
1. Run the DEMO Rent-A-Car test — verify output is identical to before (regression)
2. Run the MERODE Rent-A-Car test — verify output is identical to before (regression)
3. Run the ER Rent-A-Car test — verify the Mendix model is generated correctly
4. Show the `git diff` — quantify the change surface

The thesis should present this as a structured experiment with a clear hypothesis (the three predictions above) and the results (which predictions held, which didn't, and why).

---

## 6. What "Extensibility" Means in This Thesis

For the thesis chapter, I should be precise about what level of extensibility is being claimed and what is not:

**Claimed:** Adding a new CIM language with structural concepts (classes, attributes, associations) requires only a new CIM agent and its schema — no existing component changes.

**Not claimed:** Adding a new CIM language with *new PIM concepts* (ones not currently in pimUML) requires a minimal additive schema extension, plus new B-rules in the PSM agent. This is an expected cost of introducing genuinely new semantics and is not a violation of the extensibility architecture.

**The boundary:** The architecture is extensible at the *structural* level without any downstream changes. It is extensible at the *behavioural* level with minimal, additive changes to the shared PIM schema and to the PSM agent's rule set. This boundary is itself a finding: it shows where a common PIM's vocabulary needs to grow when a new paradigm is introduced.

This framing turns the MERODE schema extension from a potential embarrassment ("the schema had to change") into a contribution: "we can now say exactly what a shared PIM needs to support to accommodate both fact-oriented and lifecycle-oriented CIM languages."
