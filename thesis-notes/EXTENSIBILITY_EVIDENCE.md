# Proof of Extensibility

Working document on the extensibility claim: Can a new CIM language or a new PSM target be added without modifying existing components? This is the binary criterion from the proposal (Section 2.3) and operationalizes AR3.

The document is divided into three parts: first, the proof based on the actual MERODE integration (new CIM agent); second, the proof based on the actual SQL Agent integration (new PSM agent, Section 5); and finally, an assessment of which form of extensibility is thereby demonstrated overall.

---

## 1. The Claim

The thesis claims that the Modeling Bus architecture, as defined by ISO/IEC 25010, is modifiable: adding a new CIM language requires only a new agent, without modifying existing components.

The proposal operationalizes this as a binary yes/no question: Does adding a third CIM agent require changes to `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts`, or the core structure of `pimuml-schema.json`?

The answer from the MERODE integration is: mostly no, with one caveat. The PIM schema was extended additively, and the Mendix agent received new B-rules. Whether this constitutes a violation or is an expected part of the claim must be carefully argued in the thesis.

---

## 2. Evidence from the MERODE integration

### New files (purely additive; no existing files were modified)

- `mda-agents/merode-to-pim-agent.ts` (completely new)
- `mda-agents/schemas/merode-schema.json` (completely new)
- `mda-agents/tests/rent-a-car-merode.json` (completely new)

### Modified infrastructure files

- `docker-compose.yml`: a new service block added (`merode-to-pim-agent`). No existing service definitions were modified.
- Environment configuration: no changes required; all configuration is handled via environment variables for the new container.

### Modified Schemas and Types

`mda-agents/schemas/pimuml-schema.json`: The `State.kind` enum has been extended to include `"simple"` and `"final"`; the `Activity.kind` enum has been extended to include `"end"`; `Region.forEvent` has been changed from de facto required to optional. All changes are additive or relaxing. DEMO-generated PIM continues to validate without changes.

`mda-agents/schemas/types.ts`: `PimState.kind`, `PimRegion.forEvent`, and `PimActivity.kind` have been updated to reflect the schema changes, and new MERODE-specific interfaces have been added (`MerodeObjectType`, `MerodeBusinessEventType`, `MerodeAttribute`, `MerodeExistenceDependency`, `MerodeModel`).

### Modified downstream agent logic (`pim-to-mendix-agent.ts`)

This is the most critical file for the extensibility claim because it is the downstream component that "should not be modified."

What was changed: the helper function `isMerodeFSM()` was added, the B13-B16 rule blocks were inserted into `applyPimToMendix`, the subscription was switched from a single agent to multiple agents (`PIM_SOURCE_AGENTS`), and an `if (isMerodeFSM(sm)) continue` guard was inserted into the workflow generation loop.

What did not change in `pim-to-mendix-agent.ts`: the DEMO code path (B1-B12) remained unchanged, the bus subscription mechanism was extended only for the topic list, the core structure of the `applyPimToMendix` function was left untouched, and the structural B-rules (entity, attribute, and association generation) remain completely unaffected.

Scope: these statements refer to the diff for the MERODE integration. Regardless of this, `pim-to-mendix-agent.ts` was corrected on 2026-09-14 following a mapping review: B11/B12 (one workflow per DEMO region instead of a sequential workflow, `ACR_<Entity>` as an after-create handler with commit, DD13) and B15 (status for self-transitions). These changes also affect the DEMO path, but they are bug fixes to ensure the correctness of existing rules and are not the result of a language extension. Therefore, they are not included in the extensibility proof.

### Unchanged Core Files

`demo-to-pim-agent.ts`, `bus-client.ts`, and `agent-utils.ts` have not been modified.

---

## 3. Analysis: Does this meet the extensibility criterion?

The honest answer has three parts.

The new CIM agent is purely additive. `merode-to-pim-agent.ts` and `merode-schema.json` are new files. Adding them required zero changes to existing files. From the perspective of a plugin architecture, this is precisely what extensibility entails: adding a plugin requires no changes to the core.

The PIM schema was extended additively. The pimUML schema is shared infrastructure and defines the contract between CIM agents and the PSM agent. The extension for MERODE required new enum values and making a field optional. These are additive changes: no existing field was removed, renamed, or restricted in type. DEMO-generated PIMs continue to validate without any changes.

The question is whether every schema change violates the extensibility criterion. In my opinion, it does not, because the schema extension was genuinely additive in nature; it merely increased the set of valid PIM documents. A stricter version of the criterion would require that the PIM schema be frozen and that no new CIM language be allowed to introduce new PIM concepts. However, this is too strict: it would require designing the PIM from the outset to accommodate all possible future languages, which is neither feasible nor necessary. The practical criterion should be: does adding a new language require restricting existing schema constraints or breaking the DEMO agent? Neither of these things happened.

The PSM agent received new code. This is the most contentious point. A strict interpretation of the extensibility criterion states that the downstream agent must not be modified at all. But this strictness confuses two different things: changes to business logic (altering how existing PIM concepts are translated into Mendix) would break existing behavior and violate the requirement. New rule additions (adding B13-B16 for a new PIM concept that did not previously exist) extend the agent's capabilities without affecting existing logic.

Adding B13-B16 is more like installing a plugin in an extensible framework than modifying existing code. The DEMO code path in the agent was not altered.

I therefore define the extensibility criterion as "no changes to the transformation logic for existing languages" rather than "no changes to any downstream file." The proof is the specific diff: which file has changed and to what extent.

---

## 4. Line Change Analysis

Approximate number of lines affected by adding MERODE:

| File                     | Change Type                     | Approximate Lines |
| ------------------------ | ------------------------------- | ----------------- |
| `merode-to-pim-agent.ts` | New file                        | ~170              |
| `merode-schema.json`     | New file                        | ~60               |
| `rent-a-car-merode.json` | New test fixture                | ~50               |
| `pimuml-schema.json`     | Additive extension              | ~8                |
| `types.ts`               | New types and extensions        | ~45               |
| `pim-to-mendix-agent.ts` | New B-rules and helper function | ~120              |
| `docker-compose.yml`     | New service block               | ~10               |
| `demo-to-pim-agent.ts`   | No changes                      | 0                 |
| `bus-client.ts`          | No changes                      | 0                 |
| `agent-utils.ts`         | No changes                      | 0                 |

Total new code: approx. 335 lines. Modified existing files: approx. 183 lines (almost exclusively new additions to existing files; no changes to existing logic). The `git diff` clearly shows that the DEMO pipeline remains unchanged.

---

## 5. The SQL Agent as a Second Extensibility Experiment

A third agent experiment that was originally planned (an ER diagram CIM agent, E1-E2) was intended as formal but purely hypothetical proof - using predicted, not actually verified, file changes. This plan was replaced by a real, executed experiment: `pim-to-sql-agent.ts`, a second PSM agent that generates PostgreSQL DDL instead of a Mendix app. It consumes exactly the same `model.pim.created` artifact as `pim-to-mendix-agent.ts` and is therefore not a "toy" format, but a real, different target platform.

The SQL agent is a stronger proof of extensibility than the planned ER agent for two reasons: it tests the claim on the PSM side (previously proven only on the CIM side by MERODE), and it was actually built, tested, and validated against real PostgreSQL rather than merely predicted.

### New Files (purely additive; no existing files modified)

- `mda-agents/pim-to-sql-agent.ts` (completely new, ~310 lines including bus wrapper)
- `mda-agents/tests/test-sql-agent.ts` (completely new, offline test)
- `mda-agents/tests/rent-a-car-pim-full.json` (completely new test fixture)
- `mda-agents/output/.gitkeep` (empty target directory for generated DDL)
- `thesis-notes/SqlMappingRules.md` (completely new)

### Modified infrastructure files

- `docker-compose.yml`: A new service block (`sql-agent`) has been added, including an additional volume mount (`./ mda-agents/output:/app/output`) for file output - the only structural deviation from the service block pattern of the existing agents, due to the need to pass generated `.sql` files out of the container (the Mendix agent does not need this because its output goes through the Mendix Cloud API and is not a local file artifact). No existing service definitions were changed.
- `mda-agents/package.json`: a new script (`"pim-to-sql-agent"`).
- `.gitignore`: a new pattern (`mda-agents/output/*.sql`) in the existing "Generated pipeline outputs" section.
- `tests/README.md`: new rows in the file table and a new section with a reproducible Docker command to verify that it runs against a real PostgreSQL database.

Deliberate design decision: no permanent Postgres service in `docker-compose.yml`. The agent writes only `.sql` files; a real database is started only when needed as a disposable container (documented in `tests/README.md`). This keeps the permanent resource and attack surface footprint on the Raspberry Pi unchanged.

### Unchanged core files

`bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `pimuml-schema.json`, `demo-schema.json`, and `merode-schema.json` have not been modified. This is the key difference from the MERODE integration (Section 2): there, `pimuml-schema.json` had to be extended with additional elements because MERODE introduced new PIM concepts (named lifecycle states). The SQL agent exclusively uses existing pimUML constructs and therefore does not require any schema changes - not even an additive one.

### Line Change Analysis

| File                       | Change Type              | Approximate Lines |
| -------------------------- | ------------------------ | ----------------- |
| `pim-to-sql-agent.ts`      | New File                 | ~310              |
| `test-sql-agent.ts`        | New test script          | ~200              |
| `rent-a-car-pim-full.json` | New test fixture         | ~180              |
| `SqlMappingRules.md`       | New thesis documentation | ~165              |
| `docker-compose.yml`       | New service block        | ~15               |
| `package.json`             | New script line          | 1                 |
| `.gitignore`               | New pattern line         | 1                 |
| `tests/README.md`          | New sections             | ~30               |
| `bus-client.ts`            | No changes               | 0                 |
| `agent-utils.ts`           | No changes               | 0                 |
| `demo-to-pim-agent.ts`     | No changes               | 0                 |
| `merode-to-pim-agent.ts`   | No changes               | 0                 |
| `pim-to-mendix-agent.ts`   | No changes               | 0                 |
| `pimuml-schema.json`       | No changes               | 0                 |

Total new code: approx. 900 lines, distributed exclusively across new files. Modified existing files: approx. 47 lines, all of which are additive infrastructure additions (a new service block, a new script, a new `.gitignore` pattern). No existing core files were modified - the `git diff` for this work package shows only new files plus three one-line or minor additions.

### Proof of Correctness

Unlike the Mendix approach (whose correctness can only be demonstrated indirectly via the schema validation rate of the Mendix Studio Pro interface), the DDL correctness of the SQL agent can be verified directly and automatically: the generated DDL runs without errors against a real PostgreSQL instance (reproducible Docker command in `mda-agents/tests/README.md`). This is a more rigorous proof of correctness than a mere structure/schema validation because it demonstrates actual executability on the target platform, not just the syntactic plausibility of the output.

Correction 2026-09-14: The verification originally ran only against the fixture `rent-a-car-pim-full.json`. The DDL from the actual pipeline PIMs (`EVAL/demo-pim-output.json`, `merode-pim-output.json`) contained duplicate foreign key columns and was not executable (`LIMITATIONS.md` Section 5, S8). The fix affects only `pim-to-sql-agent.ts` and its test - that is, files belonging to the new agent - and does not change the diff statement above. It is a retroactive bug fix and is not part of the original extension diff.

---

## 6. What "Extensibility" Means in This Thesis

I will specify here precisely which types of extensibility I claim and which I do not.

Claimed: Adding a new CIM language with structural concepts (classes, attributes, associations) requires only a new CIM agent and its schema; no changes to existing components are necessary.

Not claimed: adding a new CIM language with genuinely new PIM concepts requires a minimal additive schema extension as well as new B-rules in the PSM agent. This is an expected cost of introducing genuinely new semantics and does not violate the extensibility architecture.

**The boundary:** At the _structural_ level, the architecture is extensible without any downstream changes. At the _behavioral_ level, it is extensible with minimal, additive changes to the common PIM schema and the PSM agent's rule set. This boundary is itself a result: it shows where the vocabulary of a common PIM must grow when a new paradigm is introduced.

This transforms the MERODE schema extension from a weakness ("the schema had to be changed") into an achievement: it is now possible to specify exactly what a common PIM must support in order to accommodate both fact-oriented and lifecycle-oriented CIM languages.

The SQL agent (Section 5) demonstrates the same claim on the PSM side, with a cleaner result: adding a second, structurally distinct PSM target for existing PIM semantics requires neither a schema extension nor changes to an existing agent - only new files and additional infrastructure. Taken together, the two experiments demonstrate the full extent of the limitation: new _languages_ (CIM or PSM) for PIM concepts already covered are purely additive; only genuinely new PIM _concepts_ (such as MERODE's sequential lifecycles) compel the common contract to evolve further.
