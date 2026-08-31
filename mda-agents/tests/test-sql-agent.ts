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
