# pimUML to PostgreSQL DDL: Formal Mapping Rules (S1-S12)

Second PSM path alongside the B rules (`MAPPING_NOTES.md` Section 5). Both paths consume
the same `model.pim.created` artifact and the same data contract (`pimuml-schema.json`); they
differ only in the target platform. In this thesis, the S-rules serve as the actual,
executed proof of extensibility (see `EXTENSIBILITY_EVIDENCE.md`); the ER diagram agent, which was classified as "more of a future work" in Section 5 of the
proposal, was not needed for this purpose.

---

## 1. Figure Table

| ID  | pimUML Source Concept                                                    | SQL Target                                                                                                                                                                                                           | Reference to B-Rules                                                                    |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| S1  | `enumerations[]`                                                         | `CREATE TYPE <name>_enum AS ENUM (...)`                                                                                                                                                                              | analogous to B4                                                                         |
| S2  | `dataTypes[]`                                                            | separate table, only `id SERIAL PRIMARY KEY`                                                                                                                                                                         | analogous to B5 (reflects the same PIM limitation)                                      |
| S3  | `associationClasses[]`                                                   | Junction table with two NOT NULL foreign keys + its own attribute columns                                                                                                                                            | analogous to B8                                                                         |
| S4  | `classes[].ownedAttributes[]` (not derived, not a DataType type)         | Column with type-mapped SQL type                                                                                                                                                                                     | analogous to B6/B7                                                                      |
| S5  | `ownedAttributes[].isDerived === true`                                   | Column is omitted                                                                                                                                                                                                    | Similar to B7 (no OCL equivalent)                                                       |
| S6  | Attribute with `type` = name of a `dataTypes[]` entry                    | Foreign key column referencing the DataType table (S2) instead of an inline column                                                                                                                                   | Similar to B5                                                                           |
| S7  | `generalizations[]`                                                      | Child table gets an additional `<parent>_id` foreign key column, `ON DELETE CASCADE`                                                                                                                                 | similar to B10                                                                          |
| S8  | `associations[]` (1:1, 1:n)                                              | Foreign key column `<Role>_id` in the many-side table, references the one-side table; `NOT NULL` if the one-side has `lower >= 1`. If the column name conflicts in the table, the column is named `<Association>_id` | analogous to B9                                                                         |
| S9  | `associations[]` (n:m, both ends `upper === "*"`)                        | separate junction table with two NOT NULL foreign keys                                                                                                                                                               | analogous to B9 (Owner/Reference becomes two foreign keys for n:m)                      |
| S10 | `stateMachines[]` with a sequential region (`isMerodeFSM` discriminator) | `status` column of type `<Entity>_status_enum` + `CREATE TYPE` from the `simple` state names                                                                                                                         | analogous to B13                                                                        |
| S11 | DEMO orthogonal FSMs (`forEvent` set)                                    | no special rule - Boolean attributes are already handled by S4                                                                                                                                                         | no B counterpart needed (B11/B12 are workflow-specific; DDL does not support workflows) |
| S12 | Table order in the output script                                         | topological sort (Kahn) based on the foreign key dependency graph                                                                                                                                                    | no B counterpart (the Mendix SDK is order-independent, whereas an SQL script is not)    |

Implementation location: `mda-agents/pim-to-sql-agent.ts`, exported pure function `pimToSql(pim: PimModel): string`. All 12 rules have been implemented and validated against the complete pimUML fixture `tests/rent-a-car-pim-full.json` (`tests/test-sql-agent.ts`, one test case per rule plus one end-to-end run). Since 2026-09-14, the same test has also been running against the two real pipeline PIMs `thesis-notes/EVAL/demo-pim-output.json` and `merode-pim-output.json` (Section 5a).

---

## 2. Standard Justification Text

**S1 - Enumeration to `CREATE TYPE ... AS ENUM`.**
pimUML enumerations have a fixed, named set of literals (analogous to Bzowski's A1/M3). PostgreSQL maps this directly to a user-defined enum type, which can then be used as a column type just like any built-in type. Unlike B4 (Mendix enumeration with separate `EnumerationValue` objects and captions), DDL does not require a UI representation of the literals, only their names as enum values. Reference: analogous to B4.

**S2 - DataType to its own empty table.**
pimUML DataTypes do not have their own structure in the current schema (see `LIMITATIONS.md`, Section 4, "pimUML schema approximates UML metaclasses in a simplified manner") - the same limitation that forces B5 in the Mendix agent to treat a DataType as a standalone entity rather than as an inline attribute type. The S rule deliberately mirrors this 1:1: a table with only one `id` column, referenced via S6. An SQL-specific shortcut (e.g., implicitly treating the DataType as an inline column) would cause the two PSM outputs to diverge structurally, without this being due to a genuine pimUML property. Reference: analogous to B5, reflects the same PIM limitation.

**S3 - AssociationClass to junction table with attribute columns.**
A pimUML AssociationClass is an association that carries properties of its own (analogous to Bzowski's A8). The SQL equivalent is a table with a synthetic `id`, one NOT-NULL foreign key column per `memberEnd`, and one column per `ownedAttribute`. This is the standard relational representation of an n:m relationship with user data and corresponds structurally to B8 (Entity + two associations in Mendix). Reference: analogous to B8.

**S4 - Class attribute to type-mapped column.**
Every non-derived, non-DataType-typed `ownedAttribute` of a class becomes a column with a PostgreSQL type mapped via `sqlType()` (`String->TEXT`, `Integer->INTEGER`, `Boolean->BOOLEAN`, `Date/DateTime->TIMESTAMP`, `Number/Decimal/Real->NUMERIC`, Enum name -> `<name>_enum`, unknown -> `TEXT` fallback). This is the direct SQL equivalent of B6/B7. An attribute with `isID: true` also becomes a `PRIMARY KEY`; if a class does not have such an attribute, the rule automatically adds a synthetic `id SERIAL PRIMARY KEY` column so that every table remains referencable (relevant for DataType tables from S2, which by definition do not have a PIM attribute). Reference: analogous to B6/B7.

**S5 - Derived attribute is omitted.**
`ownedAttributes[].isDerived === true` (e.g., from A9/M derivations) has no native DDL equivalent - a generated column (`GENERATED ALWAYS AS`) would require an OCL/ALF expression parser that lies outside the prototype scope (see DD3 in `DESIGN_DECISIONS.md`; same rationale as for the B counterpart). The rule skips such attributes without replacement, rather than generating an incorrect approximation. Reference: analogous to B7 behavior for derived attributes.

**S6 - DataType-typed attribute to FK instead of inline column.**
If an attribute's `type` string refers to a name in `pim.dataTypes[]`, the rule does not generate an inline column, but rather a `<attributname>_id INTEGER REFERENCES <datatype_table>(id)` column against the table generated in S2. This keeps the referential structure identical to B5 in the Mendix agent (where the same case is resolved using a Mendix association instead of an attribute). This foreign key relationship is noted in the table's `dependsOn` array so that S12 correctly resolves the creation order. Reference: analogous to B5.

**S7 - Generalization to required FK with cascade deletion.**
For each entry in `pim.generalizations[]`, the child table receives an additional `<parent>_id INTEGER NOT NULL REFERENCES <parent_table>(...) ON DELETE CASCADE` column. This is a deliberate simplification: pimUML assigns each class - including a generalization child class - its own independent `isID` attribute instead of a shared primary key convention (classic Table-per-Type without PK sharing). A variant with a shared primary key (child PK = parent PK) would be more elegant from a relational perspective, but would have required a convention on the PIM side that does not exist. Documented in `LIMITATIONS.md`. Reference: analogous to B10 (Mendix Generalization/Specialization, where Mendix internally manages the same type of foreign key).

**S8 - Binary 1:1/1:n association to FK on the "one" side.**
For every association where not both ends have `upper === "*"`, the same one-to-many logic as in `pim-to-mendix-agent.ts:222` (`end0.upper === "*" ? [end1, end0] : [end0, end1]`), where the FK column goes: the table on the many side receives a column `<oneEnd.name>_id` that references the table on the one side (for 1:1, the table for `end1` contains this column). Role names are unique only within an association in pimUML, not within a class. M4 names every master end `master`, and the DEMO-PIM has two associations from `Rental` to `Branch` with the role `branch`: `RentalPickedUpAt` and `RentalReturnedAt`. If the same column name were to occur multiple times in a table or conflict with an attribute column, the FK column is named `<assoc.name>_id` instead (e.g., `rental_picked_up_at_id`, `rental_depends_on_car_id`). The renaming applies equally to all conflicting columns, not just the second one, so that the name does not depend on the order in `associations[]`. The column has no `ON DELETE` clause, so the PostgreSQL default `NO ACTION` applies: a master with dependent rows cannot be deleted. Whether this column becomes `NOT NULL` depends on `oneEnd.lower` - a lower bound of `>= 1` on the "one" side means that every instance on the "many" side must always be associated with exactly one instance. Note: The column names are derived directly from the PIM role name of `memberEnd` - an A9/A7-style specialization association with the `"parent"` role automatically generates a `parent_id` column, without S8 itself "knowing" anything about generalization (see the validation example in Section 5). Reference: analogous to B9.

**S9 - n:m association to junction table without attribute columns.**
If both `memberEnds` have `upper === "*"`, a single FK column on either side is not sufficient - instead, the rule creates a new table with a synthetic `id`, named after the association itself, and two NOT-NULL FK columns. The difference from S3 (AssociationClass): a pure n:m association does not carry its own attributes, so the attribute column part is omitted. Reference: analogous to B9 (Mendix resolves n:m internally via a hidden intermediate table; DDL makes this resolution explicitly visible).

**S10 - MERODE-sequential FSM to status column + enum type.**
For every StateMachine that the `isMerodeFSM()` discriminator (identical to `pim-to-mendix-agent.ts:66`, see `LIMITATIONS.md` Section 4 regarding the fragility of this discriminator) recognizes as sequential, the rule generates a `<entity>_status_enum` type from the names of all `simple` states and adds a `status` column of this type to the corresponding class table. This is the direct structural counterpart to B13 (Mendix `<Entity>_Status` enumeration). Unlike B14-B16 (Create/Set/End microflows), S10 has no behavioral equivalent - pure DDL does not support event processing, so transitions and activities (`transitions`, `activities`) remain completely `NotMapped` for S rules. Reference: analogous to B13, without a B14-B16 equivalent.

**S11 - DEMO-orthogonal FSMs: no special rule required.**
DEMO events are already encoded in A6 as Boolean `ownedAttributes` on the class itself (`false`/`true` state pair per region), not as a separate construct. These attributes therefore automatically pass through S4 (normal column rule) - without the S-rules ever having to inspect `stateMachines[].regions[].forEvent`. This finding is worth documenting in itself: the same PIM input that requires a dedicated rule (S10) in MERODE requires none in DEMO, because the DEMO A-rules have already fully mapped the state at the attribute level before the S-rules even come into play. Reference: no B counterpart needed.

**S12 - Table order by topological sort.**
Unlike the Mendix SDK (which creates entities and associations regardless of the order in which they are declared), an SQL script is sequential, line by line: a `CREATE TABLE` statement with a `REFERENCES` clause referencing a table that does not yet exist will fail at runtime. Each foreign key-generating rule (S3, S6, S7, S8, S9) records its dependency in `TableDef.dependsOn`; `topoSortTables()` resolves this graph using the Kahn algorithm into a valid creation order, regardless of the order in `pim.classes[]`. If the algorithm finds a true cycle (two tables with mutual mandatory foreign keys), it aborts with an error message instead of silently outputting an unexecutable partial sequence - a cycle would fail at runtime anyway, so an early, clear error is far more useful. Reference: no B-language equivalent; purely an artifact of the target SQL platform.

---

## 3. Design Decision: No SQL-Specific Special Format for Data Types

An obvious alternative to S2/S6 would have been to treat a pimUML data type directly as an inline column type (e.g., `MoneyAmount` as a `NUMERIC` column instead of as a separate table with a foreign key). This would have been more relationally lean and would have generated fewer tables in the generated DDL.

The argument against this is that pimUML data types do not carry any type information in the current schema that would justify this shortcut - a data type is merely a name in the schema, not a set of fields or a base type. SQL-specific special handling would therefore have either made an arbitrary assumption (e.g., "every DataType is NUMERIC") or required a PIM extension that would have violated the extensibility claim - that no existing schema is altered. Instead, the chosen solution mirrors exactly the same limitation that B5 already accepts in the Mendix agent and keeps both PSM outputs structurally comparable: the same PIM input generates an additional "empty" table/entity per DataType in both target languages. Recommended and implemented.

---

## 4. pimUML Extension Requirements

None. The `pim-to-sql-agent` is purely a consumer of the existing `pimuml-schema.json` - it reads only constructs that already exist for the Mendix path (`enumerations`, `dataTypes`, `classes`, `associations`, `associationClasses`, `generalizations`, `stateMachines`). This fundamentally distinguishes the SQL agent from the MERODE integration: MERODE introduced new PIM concepts (named lifecycle states, `end` activities) and had to additively extend the shared schema (`MerodeMappingRules.md`, Section 4). A second PSM agent for PIM semantics that are already covered does not need to do this - it is purely a downstream consumer.

This is, in fact, the central finding supporting the extensibility claim of this work: adding a second, structurally different PSM target requires zero changes to `pimuml-schema.json`, `bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, or `pim-to-mendix-agent.ts`. Details and diff evidence: `EXTENSIBILITY_EVIDENCE.md`.

---

## 5. Rent-A-Car Validation

Source model (pimUML): `mda-agents/tests/rent-a-car-pim-full.json` - a complete fixture with an enumeration (`CarGroup`), DataType (`MoneyAmount`), generalization (`Car`->`Vehicle`), AssociationClass (`BookingDetail`), two A9-style specialization associations (`PremiumCustomerIsAPerson`, `ActiveRentalIsARental`), and a DEMO-orthogonal FSM on `Rental`.

Generated DDL (`mda-agents/output/rent-a-car.sql`, via `npx ts-node tests/test-sql-agent.ts`):

```sql
-- Generated by pim-to-sql-agent from pimUML model "Rent-A-Car - pimUML"
-- Do not edit by hand.

CREATE TYPE car_group_enum AS ENUM ('economy', 'compact', 'luxury');

CREATE TABLE "money_amount" (
  "id" SERIAL PRIMARY KEY
);

CREATE TABLE "vehicle" (
  "vehicle_id" INTEGER PRIMARY KEY,
  "license_plate" TEXT
);

CREATE TABLE "person" (
  "person_id" INTEGER PRIMARY KEY,
  "name" TEXT
);

CREATE TABLE "car" (
  "car_id" INTEGER PRIMARY KEY,
  "group" car_group_enum,
  "vehicle_id" INTEGER NOT NULL REFERENCES "vehicle"("vehicle_id") ON DELETE CASCADE
);

CREATE TABLE "premium_customer" (
  "premium_customer_id" INTEGER PRIMARY KEY,
  "parent_id" INTEGER NOT NULL REFERENCES "person"("person_id")
);

CREATE TABLE "rental" (
  "rental_id" INTEGER PRIMARY KEY,
  "starting_day" TEXT,
  "ending_day" TEXT,
  "rental_started" BOOLEAN DEFAULT false,
  "rental_completed" BOOLEAN DEFAULT false,
  "rental_line_id" INTEGER,
  "car_id" INTEGER NOT NULL REFERENCES "car"("car_id"),
  "renter_id" INTEGER NOT NULL REFERENCES "person"("person_id")
);

CREATE TABLE "rental_line" (
  "rental_line_id" INTEGER PRIMARY KEY,
  "quantity" INTEGER,
  "rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")
);

CREATE TABLE "active_rental" (
  "active_rental_id" INTEGER PRIMARY KEY,
  "parent_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")
);

CREATE TABLE "booking_detail" (
  "id" SERIAL PRIMARY KEY,
  "rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id"),
  "car_id" INTEGER NOT NULL REFERENCES "car"("car_id"),
  "price_per_day" INTEGER,
  "notes" TEXT
);
```

Validation Observations:

- **S1/S2** - `CarGroup` becomes `car_group_enum`, and `MoneyAmount` becomes its own empty `money_amount` table (S2), even though no attribute in this snippet references them - the table is created regardless of its actual use, consistent with B5.
- **S4/S5** - `Rental.rentalStarted`/`rentalCompleted` (from A6, DEMO event types) pass through S4 as normal `BOOLEAN` columns with `DEFAULT false`, without any special FSM handling (S11 finding directly visible).
- **S7** - `Car` receives a required `vehicle_id` foreign key with `ON DELETE CASCADE` from the single `generalizations[]` entry.
- **S8 to A9 Specialization Associations** - `PremiumCustomerIsAPerson` and `ActiveRentalIsARental` are regular `associations[]` entries (not `generalizations[]`), each of which has the PIM role `"parent"` as its "one" end. S8 generates `parent_id` columns on `premium_customer` and `active_rental`, respectively - the column name is derived exclusively from the PIM role name; S8 itself does not distinguish between a "true" generalization (S7) and a specialization association. This is correct behavior; do not confuse it: A9/A7 specializations are intentionally modeled as associations in the pimUML schema, not as generalizations (see A7/A9 in `MAPPING_NOTES.md`, Section 3).
- **S3** - `BookingDetail` (AssociationClass; `triggerEvent` is ignored for DDL because it has no behavior) creates a junction table with two required foreign keys (`rental_id`, `car_id`) and its own attribute columns `price_per_day`, `notes`.
- **S12** - `money_amount`, `vehicle`, and `person` appear before `car` (depends on `vehicle`) and `rental` (depends on `car` and `person`); `rental_line`, `active_rental`, and `booking_detail` appear last, since they depend on `rental`. This order results purely from topological sort, regardless of the declaration order in `pim.classes[]` (see `test-sql-agent.ts`, S12 test case with intentionally swapped declaration order).

Proof of concept against a real PostgreSQL instance: reproducible Docker command in `mda-agents/tests/README.md`.

## 5a. Validation against the real pipeline PIMs

The fixture from Section 5 contains at most one association with a unique role name per class pair. The PIMs actually published by `demo-to-pim-agent` and `merode-to-pim-agent` (`thesis-notes/EVAL/demo-pim-output.json`, `merode-pim-output.json`) do not do this. Until 2026-09-14, S8 generated duplicate columns from this, which PostgreSQL rejects with the error "column specified more than once":

- DEMO: `rental` received `branch_id` twice (`RentalPickedUpAt`, `RentalReturnedAt`).
- MERODE: `rental` received `master_id` three times (`RentalDependsOnCar`, `...Person`, `...Branch`).

After the fix (collision rule in S8), the result is:

| PIM    | Table         | FK Columns                                                                               |
| ------ | ------------- | ---------------------------------------------------------------------------------------- |
| DEMO   | `rental`      | `car_id`, `renter_id`, `rental_picked_up_at_id`, `rental_returned_at_id`                 |
| DEMO   | `rental_line` | `rental_id`                                                                              |
| MERODE | `rental`      | `rental_depends_on_car_id`, `rental_depends_on_person_id`, `rental_depends_on_branch_id` |
| MERODE | `rental_line` | `master_id` (no collision, keeps the role name)                                          |
| MERODE | `invoice`     | `master_id` (no collision)                                                               |

`tests/test-sql-agent.ts` checks for both PIMs to ensure that no table contains duplicate column names, and writes `output/rent-a-car-demo.sql` and `output/rent-a-car-merode.sql` for Postgres verification. Ran on 2026-09-14 against `postgres:16-alpine` with `ON_ERROR_STOP=1` (command in `mda-agents/tests/README.md`): all three scripts completed without errors. DEMO generates 1 type and 14 tables, MERODE generates 7 types and 7 tables, and the fixture generates 1 type and 9 tables. Observation: In `merode-pim-output.json`, `master_id` is set to `rental_line` and `invoice` - which isn't very descriptive, but is correct. The name comes from M4, not S8.
