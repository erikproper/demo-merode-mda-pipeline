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
