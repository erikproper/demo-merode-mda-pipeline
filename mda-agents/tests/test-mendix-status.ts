// Standalone test: B15 status target of MERODE set-microflows (resolveStatusTarget),
// without MQTT broker or Mendix Platform SDK.
//
// Run:
//   npx ts-node tests/test-mendix-status.ts

import * as fs from "fs";
import * as path from "path";
import type { PimModel, PimRegion } from "../schemas/types";
import { resolveStatusTarget } from "../pim-to-mendix-agent";

function expect(label: string, actual: string | undefined, expected: string | undefined): void {
  if (actual !== expected) {
    console.error(`FAIL: ${label} - expected ${expected ?? "unchanged"}, got ${actual ?? "unchanged"}`);
    process.exit(1);
  }
  console.log(`OK   ${label} -> ${actual ?? "unchanged"}`);
}

// Inline fixture: sequential lifecycle with one real transition and one propagated
// event (self-transition in every state, as produced by M9)
const region: PimRegion = {
  name: "Rental_lifecycle",
  states: [],
  transitions: [
    { from: "__initial",   to: "active",      trigger: "startRental" },
    { from: "active",      to: "active",      trigger: "extendRental" },
    { from: "active",      to: "depositPaid", trigger: "payDeposit" },
    { from: "active",      to: "active",      trigger: "addRentalLine" },
    { from: "depositPaid", to: "depositPaid", trigger: "addRentalLine" },
  ],
};

expect("real transition payDeposit",          resolveStatusTarget(region, "payDeposit"),    "depositPaid");
expect("self-transition extendRental",        resolveStatusTarget(region, "extendRental"),  undefined);
expect("propagated self-transitions",         resolveStatusTarget(region, "addRentalLine"), undefined);

// Regression against the MERODE PIM produced by the live pipeline
const pimPath = path.join(__dirname, "..", "..", "thesis-notes", "EVAL", "merode-pim-output.json");
const raw     = JSON.parse(fs.readFileSync(pimPath, "utf-8"));
const pim: PimModel = raw.payload ?? raw;
const rental  = pim.stateMachines?.find(sm => sm.name === "SM_Rental");
if (!rental) {
  console.error("FAIL: SM_Rental not found in merode-pim-output.json");
  process.exit(1);
}
const r = rental.regions[0];
expect("SM_Rental payDeposit",       resolveStatusTarget(r, "payDeposit"),       "depositPaid");
expect("SM_Rental returnCar",        resolveStatusTarget(r, "returnCar"),        "returned");
expect("SM_Rental payInvoice",       resolveStatusTarget(r, "payInvoice"),       "invoicePaid");
expect("SM_Rental extendRental",     resolveStatusTarget(r, "extendRental"),     undefined);
for (const evt of ["addRentalLine", "updateRentalLine", "removeRentalLine", "issueInvoice", "markInvoicePaid", "closeInvoice"]) {
  expect(`SM_Rental ${evt}`, resolveStatusTarget(r, evt), undefined);
}

console.log("B15 status OK");
