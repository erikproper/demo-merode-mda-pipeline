# tests/

Test data and offline scripts for the entire pipeline (DEMO/MERODE -> pimUML -> Mendix/SQL).

**Important note:** `test-transform.ts` and `smoke-m9-m3.ts` are standalone,
hand-written partial reimplementations of the respective mapping logic - they **do not**
the actual `transform()` functions from `demo-to-pim-agent.ts`/`merode-to-pim-agent.ts`.
`test-transform.ts` only covers A3, A5 and A12 (classes + attributes + associations from
entity/fact types), not A1/A2/A4/A6-A11. `smoke-m9-m3.ts` replicates the M3/M9 EDG propagation
but has a known discrepancy with `markInvoicePaid` (is incorrectly rendered as
a self-transition instead of a regular transition). Both scripts are intended as a quick
smoke test, not as proof of production logic - the authoritative proof is the
full bus run (`mda-agents/README.md`, Option B) or a run against the live pipeline.
See `thesis-notes/PROTOTYPE_TODOS.md` for the current status of this limitation.

## Files

| File                            | Description                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rent-a-car-demo.json`          | **Input** - valid DEMO Fact Model (Rent-A-Car use case)                                                                                                                                                                                                          |
| `rent-a-car-merode.json`        | **Input** - valid MERODE Domain Model (Rent-A-Car use case)                                                                                                                                                                                                      |
| `rent-a-car-case-demo.json`     | **Input** - scenario-based DEMO Fact Model based on Bzowski's Rent-A-Car Fact Model (second analysis unit, no rule coverage)                                                                                                                                     |
| `rent-a-car-case-merode.json`   | **Input** - MERODE counterpart to the scenario-based DEMO model                                                                                                                                                                                                  |
| `test-transform.ts`             | **Offline smoke test** - Subset A3/A5/A12 without MQTT broker, writes `rent-a-car-pim-from-bus.json`                                                                                                                                                             |
| `smoke-m9-m3.ts`                | **Offline smoke test** - M3/M9 EDG propagation without an MQTT broker (known `markInvoicePaid` discrepancy, see above)                                                                                                                                           |
| `pim-subscriber.ts`             | **Bus utility** - subscribes to `model.pim.created`, writes `rent-a-car-pim-from-bus.json`                                                                                                                                                                       |
| `rent-a-car-pim-from-bus.json`  | _Generated_ by `test-transform.ts` or `pim-subscriber` - not versioned (.gitignore)                                                                                                                                                                              |
| `rent-a-car-pim-full.json`      | **Input** - complete pimUML fixture for `test-sql-agent.ts` (enums, data types, AssociationClass, generalisation, associations, orthogonal FSMs)                                                                                                                 |
| `test-sql-agent.ts`             | **Offline test** - `pim-to-sql-agent`, one case per S-rule + end-to-end run, writes `../ output/rent-a-car.sql`, additionally checks `thesis-notes/EVAL/{demo,merode}-pim-output.json` for duplicate columns and writes `../output/rent-a-car-{demo,merode}.sql` |
| `test-mendix-status.ts`         | **Offline test** - `resolveStatusTarget()` from `pim-to-mendix-agent` (B15 target state; self-transitions leave the status unchanged), inline fixture + `thesis-notes/EVAL/merode-pim-output.json`                                                               |
| `test-mendix-workflows.ts`      | **Offline test** - `planRegionWorkflows()` from `pim-to-mendix-agent` (B11/B12, one workflow per DEMO region), against `thesis-notes/EVAL/demo-pim-output.json`                                                                                                  |
| `dump-mendix-domain.ts`         | **Readback test** - reads the target state from the Mendix app via the Platform SDK (read-only, no commit), writes to `thesis-notes/EVAL/Eval_new/<name>.mendix.json`                                                                                            |
| `check-mendix-against-input.ts` | **Cross-check** - compares the retrieved Mendix model against the DEMO/MERODE input model, checking entities, attribute types, enum literals, association direction, generalisation, status enums and behaviour artefacts                                        |
| `../output/*.sql`               | _Generated_ by `test-sql-agent.ts` or `pim-to-sql-agent` in production - not version-controlled (.gitignore)                                                                                                                                                     |

---

## pim-to-sql-agent - DDL execution verification against a real PostgreSQL instance

The DDL generated by `pim-to-sql-agent` should not only appear syntactically valid,
but should also be verifiably error-free when run against a real PostgreSQL instance. To achieve this,
a disposable container is sufficient (no entry in `docker-compose.yml`, no persistent state):

```bash
# 1. Generate DDL (creates mda-agents/output/rent-a-car.sql, rent-a-car-demo.sql, rent-a-car-merode.sql)
cd mda-agents && npx ts-node tests/test-sql-agent.ts

# 2. Start a disposable Postgres instance
docker run -d --name sql-proof -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine

# 3. Wait until Postgres is ready
until docker exec sql-proof pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# 4. Execute each generated DDL in a separate database (aborts on the first error)
for f in rent-a-car rent-a-car-demo rent-a-car-merode; do
  db=$(echo $f | tr - _)
  docker exec sql-proof psql -U postgres -c "CREATE DATABASE $db"
  docker exec -i sql-proof psql -U postgres -d $db -v ON_ERROR_STOP=1 < output/$f.sql || echo "ERROR in $f.sql"
done

# 5. Check the result (lists the tables from the MERODE script)
docker exec sql-proof psql -U postgres -d rent_a_car_merode -c '\dt'

# 6. Clean up
docker rm -f sql-proof
```

No error in step 4 = proof of executability provided. This test is deliberately
not included in `test-sql-agent.ts`, as it requires a running Docker daemon and
would therefore not run in every environment (e.g. CI without Docker).

---

## dump-mendix-domain.ts - independent cross-check of the Mendix result

The artefact counts in `thesis-notes/EVAL/FRAMEWORK.md`, section 8.1, are taken from the log of the
`pim-to-mendix-agent` itself - in other words, the agent reports what it believes it has generated. This
script retrieves the target state from the Team Server via the Platform SDK independently of this
and makes it machine-verifiable. It does not write anything to the app and does not commit anything.

As `pim-to-mendix-agent.ts` clears the module before each run, the app always retains only the
result of the last run. For all four units of analysis, therefore, trigger and read back alternately
for each model:

```bash
# 1. Trigger the pipeline (runs on the Pi, writes to the Mendix app)
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: demo" \
  -d @mda-agents/tests/rent-a-car-demo.json

# 2. Wait until mendix-agent reports "committed to branch", then read the output
cd mda-agents && npx ts-node -r dotenv/config tests/dump-mendix-domain.ts rent-a-car-demo
```

The prerequisites are `MENDIX_TOKEN`, `MENDIX_APP_ID`, `MENDIX_MODULE_NAME` and `MENDIX_BRANCH`
in `mda-agents/.env` - the same variables that the agent itself uses. The call takes
around one minute, as the SDK first creates a temporary working copy.

The generated JSON file contains, for each entity, the attributes with their Mendix types; for each association,
the direction (`parent` is the "many" side that holds the reference), as well as the association type and
owner; plus all enumerations with their literals and the names of all microflows, workflows
and pages. With `--deep`, all microflows are also loaded and their activity types
counted - significantly slower, but useful for checking individual B-rules.

### The actual test

`dump-mendix-domain.ts` is read-only. The test is run using:

```bash
npx ts-node tests/check-mendix-against-input.ts rent-a-car-demo
```

The tester compares the dump **against the input model**, i.e. against `tests/rent-a-car-demo.json`
and not against the PIM. This ensures that the entire chain CIM -> PIM -> PSM is checked, rather than
just its final step. The check is performed in both directions; therefore, there must be neither an
input element without a corresponding entry in Mendix nor a Mendix artefact without an origin in
the input model:

| Input element                          | Expectation in Mendix                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| EntityType / ObjectType                | Entity of the same name plus `<Name>ID : Integer`                                                            |
| categorical ValueType / DomainType     | Enumeration with the same literals in the same order                                                         |
| non-categorical ValueType / DomainType | separate entity (B5)                                                                                         |
| Attribute                              | Column of the expected Mendix type; for non-categorical types, an association `<Entity>_<Attribute>` instead |
| Attribute with `derivationRule`        | **No** column; marked as a justified omission                                                                |
| EventType (DEMO)                       | Boolean column with default value `false` (A6) plus `WF_<Entity>_<Event>` and `Set<Entity>_<Event>`          |
| FactType                               | Association; `parent` is the role with `upper: "*"`, `child` is the role with `upper: 1`                     |
| ExistenceDependency                    | Association; `parent` is the `dependent`, `child` is the `master`                                            |
| Specialisation without trigger         | Generalisation: child -> parent (A10)                                                                        |
| Specialisation with trigger / derived  | Association `<Child>IsA<Parent>`, `parent` is the child (A7, A9)                                             |
| `lifecycleStates`                      | `<ObjectType>_Status` with the same states plus a `status` column                                            |
| BusinessEventType role C / E / M       | `Create_<OT>` / `End_<OT>` / `Set_<OT>_<Event>`                                                              |

The directional check is key: in Mendix, the `parent` side of a reference holds the
reference, so it must be the "many" side. If the sides are swapped, the
foreign key is on the wrong entity - the validator explicitly reports this. If a FactType
is `upper: "*"` on both sides, it reports that a reference cannot support this multiplicity.

The exit code is 0 if everything is correct and 1 otherwise, so the validator is also suitable as a
regression test. Justified omissions (`NOTMAPPED`) do not count as discrepancies.

---

## rent-a-car-demo.json / rent-a-car-merode.json - current coverage

Both fixtures have been specifically designed so that every A-rule (DEMO) or M-rule (MERODE)
is triggered at least once (see `thesis-notes/EVAL/FRAMEWORK.md` for the complete
verification, checked against the actual Transform output). Status: current fixture content.

**rent-a-car-demo.json**

| Element                                | Number                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| ValueTypes                             | 3 (CarGroup, MoneyAmount, BookingDetail)                                                      |
| Total EntityTypes (declared + derived) | 12                                                                                            |
| EventTypes                             | 17                                                                                            |
| FactTypes                              | 5 (RentalHasLines, RentalInvolvesCar, RentalMadeByPerson, RentalPickedUpAt, RentalReturnedAt) |

**rent-a-car-merode.json**

| Element               | Count                                                |
| --------------------- | ---------------------------------------------------- |
| ObjectTypes           | 6 (Car, Branch, Person, Rental, RentalLine, Invoice) |
| DomainTypes           | 2 (CarGroup, MoneyAmount)                            |
| ExistenceDependencies | 5                                                    |
| BusinessEventTypes    | 20                                                   |

Earlier versions of this file described a structurally different, smaller DEMO fixture
(including, amongst others, the entities `Year`, `RentalYear`,
`ManagingDay` and `YearlyCarGroup`, which no longer exist). This iteration has been replaced by the current, more
comprehensive Rent-A-Car fixture - the workarounds mentioned above are therefore no longer relevant
(for example, `CarGroup` now uses regular, business-relevant literals instead of a
placeholder workaround).

---

## rent-a-car-case-demo.json / rent-a-car-case-merode.json - a pair of case-based models

This second pair is **not** intended to achieve rule coverage. It replicates Bzowski's
published DEMO fact model for Rent-A-Car (Master's thesis, Vienna University of Technology, 2025,
Figures 6.2 to 6.4 and Appendix G, Tables G.1 to G.5), which in turn is based on
Dietz and Mulder, Chapter 15. The aim is external validity: the
quality of the transformation should also be measured against a model that was not designed
specifically for this artefact.

Accordingly, **not** all rules are active here. A8 (AssociationClass), A9 (derived
specialisation), A10 (simple generalisation) and the derivation rules remain inactive,
because Bzowski's fact model does not contain the corresponding constructs. A7, on the other hand, fires four times,
once for each event-triggered specialisation of RENTAL.

| Element                           | `rent-a-car-case-demo.json` | `rent-a-car-case-merode.json` |
| --------------------------------- | --------------------------- | ----------------------------- |
| ValueTypes / DomainTypes          | 4                           | 4                             |
| EntityTypes / ObjectTypes         | 14                          | 10                            |
| FactTypes / ExistenceDependencies | 14                          | 8                             |
| EventTypes / BusinessEventTypes   | 7                           | 30                            |

Three constructs from Bzowski's model cannot be expressed in the input schema and are
mapped faithfully in terms of content, but with changes to their form: the aggregated entity type
`{CAR GROUP} * {YEAR}` becomes the entity type `YearlyCarGroup`, the attributed value type
`{YEAR}` becomes the entity type `Year`, and `{CAR GROUP}` is assigned literals because an empty
enum violates `pimuml-schema.json`. The complete list of deviations, with justifications,
can be found in `thesis-notes/EVAL/FRAMEWORK.md`, section 4.2.

Test commands against the live pipeline:

```bash
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: demo" \
  -d @mda-agents/tests/rent-a-car-case-demo.json

curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-case-merode.json
```
