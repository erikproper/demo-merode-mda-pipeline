// Standalone test: runs pim-to-sql-agent's pimToSql() without needing an MQTT broker.
// Grows rule by rule alongside pim-to-sql-agent.ts (S1, S2, ...).
//
// Run:
//   npx ts-node tests/test-sql-agent.ts

import type { PimModel } from "../schemas/types";
import { pimToSql } from "../pim-to-sql-agent";

// S1: enumerations -> CREATE TYPE ... AS ENUM
const enumPim: PimModel = {
  name: "S1 smoke test",
  enumerations: [
    { name: "CarGroup", literals: ["economy", "compact", "luxury"] },
  ],
};

const enumDdl = pimToSql(enumPim);
console.log(enumDdl);

if (!enumDdl.includes(`CREATE TYPE car_group_enum AS ENUM ('economy', 'compact', 'luxury');`)) {
  console.error("FAIL: expected CREATE TYPE statement not found");
  process.exit(1);
}
console.log("S1 OK");

// S4: classes -> CREATE TABLE with attribute columns.
// "group" is a reserved SQL word - regression test for identifier quoting.
const classPim: PimModel = {
  name: "S4 smoke test",
  enumerations: [{ name: "CarGroup", literals: ["economy", "compact", "luxury"] }],
  classes: [
    {
      name: "Car",
      ownedAttributes: [
        { name: "CarID", type: "Integer", isID: true },
        { name: "group", type: "CarGroup" },
        { name: "licensePlate", type: "String" },
      ],
    },
    {
      name: "Rental",
      ownedAttributes: [
        { name: "rentalStarted", type: "Boolean", defaultValue: "false" },
      ],
    },
  ],
};

const classDdl = pimToSql(classPim);
console.log(classDdl);

if (!classDdl.includes(`"car_id" INTEGER PRIMARY KEY`)) {
  console.error("FAIL: expected ID column not found");
  process.exit(1);
}
if (!classDdl.includes(`"group" car_group_enum`)) {
  console.error("FAIL: reserved-word column \"group\" not quoted correctly");
  process.exit(1);
}
if (!classDdl.includes(`"id" SERIAL PRIMARY KEY`)) {
  console.error("FAIL: expected synthetic id column for class without isID attribute");
  process.exit(1);
}
if (!classDdl.includes(`DEFAULT false`)) {
  console.error("FAIL: expected boolean default value");
  process.exit(1);
}
console.log("S4 OK");

// S5: derived attributes are skipped - no OCL/computed-column equivalent
const derivedPim: PimModel = {
  name: "S5 smoke test",
  classes: [
    {
      name: "Rental",
      ownedAttributes: [
        { name: "RentalID", type: "Integer", isID: true },
        { name: "startingDay", type: "String" },
        { name: "endingDay", type: "String" },
        { name: "totalDays", type: "Integer", isDerived: true, derivationRule: "self.endingDay - self.startingDay" },
      ],
    },
  ],
};

const derivedDdl = pimToSql(derivedPim);
console.log(derivedDdl);

if (derivedDdl.includes(`"total_days"`)) {
  console.error("FAIL: derived attribute should have been skipped");
  process.exit(1);
}
if (!derivedDdl.includes(`"starting_day"`)) {
  console.error("FAIL: non-derived attribute missing");
  process.exit(1);
}
console.log("S5 OK");

// S2: non-categorical DataTypes -> own id-only table
const dataTypePim: PimModel = {
  name: "S2 smoke test",
  dataTypes: [{ name: "MoneyAmount" }],
};

const dataTypeDdl = pimToSql(dataTypePim);
console.log(dataTypeDdl);

if (!dataTypeDdl.includes(`CREATE TABLE "money_amount" (\n  "id" SERIAL PRIMARY KEY\n);`)) {
  console.error("FAIL: expected id-only DataType table not found");
  process.exit(1);
}
console.log("S2 OK");

// S6: DataType-typed attribute -> deferred FK column instead of an inline column
const dtFkPim: PimModel = {
  name: "S6 smoke test",
  dataTypes: [{ name: "MoneyAmount" }],
  classes: [
    {
      name: "Rental",
      ownedAttributes: [
        { name: "RentalID", type: "Integer", isID: true },
        { name: "depositAmount", type: "MoneyAmount" },
      ],
    },
  ],
};

const dtFkDdl = pimToSql(dtFkPim);
console.log(dtFkDdl);

if (!dtFkDdl.includes(`"deposit_amount_id" INTEGER REFERENCES "money_amount"("id")`)) {
  console.error("FAIL: expected DataType FK column not found");
  process.exit(1);
}
console.log("S6 OK");

// S3: association classes -> junction table with two FKs + own attributes
const acPim: PimModel = {
  name: "S3 smoke test",
  classes: [
    { name: "Rental", ownedAttributes: [{ name: "RentalID", type: "Integer", isID: true }] },
    { name: "Car",     ownedAttributes: [{ name: "CarID",    type: "Integer", isID: true }] },
  ],
  associationClasses: [
    {
      name: "BookingDetail",
      triggerEvent: "rentalStarted",
      memberEnds: [
        { name: "rental", type: "Rental", lower: 0, upper: "*" },
        { name: "car",    type: "Car",    lower: 0, upper: "*" },
      ],
      ownedAttributes: [
        { name: "pricePerDay", type: "Integer" },
        { name: "notes",       type: "String" },
      ],
    },
  ],
};

const acDdl = pimToSql(acPim);
console.log(acDdl);

if (!acDdl.includes(`"rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")`)) {
  console.error("FAIL: expected rental FK in association class table not found");
  process.exit(1);
}
if (!acDdl.includes(`"car_id" INTEGER NOT NULL REFERENCES "car"("car_id")`)) {
  console.error("FAIL: expected car FK in association class table not found");
  process.exit(1);
}
if (!acDdl.includes(`"price_per_day" INTEGER`)) {
  console.error("FAIL: expected association class attribute not found");
  process.exit(1);
}
console.log("S3 OK");

// S7: generalizations -> child gets an extra mandatory FK column to the parent, cascading delete
const genPim: PimModel = {
  name: "S7 smoke test",
  classes: [
    { name: "Vehicle", ownedAttributes: [{ name: "VehicleID", type: "Integer", isID: true }, { name: "licensePlate", type: "String" }] },
    { name: "Car",      ownedAttributes: [{ name: "CarID",     type: "Integer", isID: true }] },
  ],
  generalizations: [{ child: "Car", parent: "Vehicle" }],
};

const genDdl = pimToSql(genPim);
console.log(genDdl);

if (!genDdl.includes(`"vehicle_id" INTEGER NOT NULL REFERENCES "vehicle"("vehicle_id") ON DELETE CASCADE`)) {
  console.error("FAIL: expected generalization FK column not found");
  process.exit(1);
}
console.log("S7 OK");

// S8: one-to-many association -> FK column on the "many" side, NOT NULL when the "one"
// end's lower bound is >= 1
const assocPim: PimModel = {
  name: "S8 smoke test",
  classes: [
    { name: "Rental",     ownedAttributes: [{ name: "RentalID", type: "Integer", isID: true }] },
    { name: "RentalLine", ownedAttributes: [{ name: "RentalLineID", type: "Integer", isID: true }] },
  ],
  associations: [
    {
      name: "RentalHasLines",
      memberEnds: [
        { name: "rental",     type: "Rental",     lower: 1, upper: 1 },
        { name: "rentalLine", type: "RentalLine", lower: 0, upper: "*" },
      ],
    },
  ],
};

const assocDdl = pimToSql(assocPim);
console.log(assocDdl);

if (!assocDdl.includes(`"rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")`)) {
  console.error("FAIL: expected mandatory association FK column not found");
  process.exit(1);
}
console.log("S8 OK");

// S9: many-to-many association -> junction table with two NOT NULL FKs, no attributes
const n2mPim: PimModel = {
  name: "S9 smoke test",
  classes: [
    { name: "Person", ownedAttributes: [{ name: "PersonID", type: "Integer", isID: true }] },
    { name: "Rental",  ownedAttributes: [{ name: "RentalID", type: "Integer", isID: true }] },
  ],
  associations: [
    {
      name: "PersonRentsVehicles",
      memberEnds: [
        { name: "person", type: "Person", lower: 0, upper: "*" },
        { name: "rental", type: "Rental", lower: 0, upper: "*" },
      ],
    },
  ],
};

const n2mDdl = pimToSql(n2mPim);
console.log(n2mDdl);

if (!n2mDdl.includes(`CREATE TABLE "person_rents_vehicles"`)) {
  console.error("FAIL: expected n:m junction table not found");
  process.exit(1);
}
if (!n2mDdl.includes(`"person_id" INTEGER NOT NULL REFERENCES "person"("person_id")`)) {
  console.error("FAIL: expected person FK in junction table not found");
  process.exit(1);
}
if (!n2mDdl.includes(`"rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")`)) {
  console.error("FAIL: expected rental FK in junction table not found");
  process.exit(1);
}
console.log("S9 OK");

// S10: MERODE sequential FSM -> status column + <entity>_status_enum type
const fsmPim: PimModel = {
  name: "S10 smoke test",
  classes: [
    { name: "Rental", ownedAttributes: [{ name: "RentalID", type: "Integer", isID: true }] },
  ],
  stateMachines: [
    {
      name: "RentalLifecycle",
      entityType: "Rental",
      regions: [
        {
          name: "lifecycle",
          states: [
            { name: "initial",    kind: "initial" },
            { name: "active",     kind: "simple" },
            { name: "returned",   kind: "simple" },
            { name: "final",      kind: "final" },
          ],
          transitions: [],
        },
      ],
    },
  ],
};

const fsmDdl = pimToSql(fsmPim);
console.log(fsmDdl);

if (!fsmDdl.includes(`CREATE TYPE rental_status_enum AS ENUM ('active', 'returned');`)) {
  console.error("FAIL: expected status enum type not found");
  process.exit(1);
}
if (!fsmDdl.includes(`"status" rental_status_enum`)) {
  console.error("FAIL: expected status column not found");
  process.exit(1);
}
console.log("S10 OK");

// S12: topological sort - FK pointing "backwards" in pim.classes array order must still
// produce a valid CREATE TABLE sequence (dependency before dependent)
const orderPim: PimModel = {
  name: "S12 smoke test",
  classes: [
    // RentalLine declared BEFORE Rental, but its FK (added below) points at Rental
    { name: "RentalLine", ownedAttributes: [{ name: "RentalLineID", type: "Integer", isID: true }] },
    { name: "Rental",     ownedAttributes: [{ name: "RentalID",     type: "Integer", isID: true }] },
  ],
  associations: [
    {
      name: "RentalHasLines",
      memberEnds: [
        { name: "rental",     type: "Rental",     lower: 1, upper: 1 },
        { name: "rentalLine", type: "RentalLine", lower: 0, upper: "*" },
      ],
    },
  ],
};

const orderDdl = pimToSql(orderPim);
console.log(orderDdl);

const rentalIdx     = orderDdl.indexOf(`CREATE TABLE "rental" (`);
const rentalLineIdx = orderDdl.indexOf(`CREATE TABLE "rental_line" (`);
if (rentalIdx === -1 || rentalLineIdx === -1 || rentalIdx > rentalLineIdx) {
  console.error("FAIL: expected 'rental' table to be created before 'rental_line' despite declaration order");
  process.exit(1);
}
console.log("S12 OK");

// S12: a genuine FK cycle must throw with a clear error naming the involved tables
const cyclePim: PimModel = {
  name: "S12 cycle test",
  classes: [
    { name: "A", ownedAttributes: [{ name: "AID", type: "Integer", isID: true }] },
    { name: "B", ownedAttributes: [{ name: "BID", type: "Integer", isID: true }] },
  ],
  associations: [
    { name: "AtoB", memberEnds: [{ name: "a", type: "A", lower: 1, upper: 1 }, { name: "b", type: "B", lower: 0, upper: 1 }] },
    { name: "BtoA", memberEnds: [{ name: "b", type: "B", lower: 1, upper: 1 }, { name: "a", type: "A", lower: 0, upper: 1 }] },
  ],
};

try {
  pimToSql(cyclePim);
  console.error("FAIL: expected a cyclic-dependency error to be thrown");
  process.exit(1);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  if (!message.includes("cyclic")) {
    console.error(`FAIL: expected cyclic-dependency error, got: ${message}`);
    process.exit(1);
  }
}
console.log("S12 cycle detection OK");
