// Standalone test: B11/B12 workflow plan for DEMO state machines (planRegionWorkflows),
// without MQTT broker or Mendix Platform SDK.
//
// Run:
//   npx ts-node tests/test-mendix-workflows.ts

import * as fs from "fs";
import * as path from "path";
import type { PimModel } from "../schemas/types";
import { planRegionWorkflows } from "../pim-to-mendix-agent";

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const pimPath = path.join(__dirname, "..", "..", "thesis-notes", "EVAL", "demo-pim-output.json");
const pim: PimModel = JSON.parse(fs.readFileSync(pimPath, "utf-8"));
const rental = pim.stateMachines?.find(sm => sm.name === "SM_Rental") ?? fail("SM_Rental not found in demo-pim-output.json");

const plans = planRegionWorkflows(rental);
plans.forEach(p => console.log(`     ${p.workflowName}: ${p.waitName} -> ${p.setMicroflow}${p.entryActivity ? " -> " + p.entryActivity : ""}`));

// one workflow per orthogonal region, not one sequential workflow per state machine
if (plans.length !== rental.regions.length) fail(`expected ${rental.regions.length} workflows, got ${plans.length}`);
if (new Set(plans.map(p => p.workflowName)).size !== plans.length) fail("workflow names are not unique");
console.log(`OK   SM_Rental -> ${plans.length} independent workflows`);

const deposit = plans.find(p => p.workflowName === "WF_Rental_depositPaid") ?? fail("WF_Rental_depositPaid missing");
if (deposit.waitName !== "Wait_depositPaid")               fail(`wait name ${deposit.waitName}`);
if (deposit.setMicroflow !== "SetRental_depositPaid")      fail(`set microflow ${deposit.setMicroflow}`);
if (deposit.entryActivity !== "CreateDepositPaidRental")   fail(`entry activity ${deposit.entryActivity}`);
console.log("OK   WF_Rental_depositPaid: wait + set + create entry activity");

const extended = plans.find(p => p.workflowName === "WF_Rental_rentalExtended") ?? fail("WF_Rental_rentalExtended missing");
if (extended.entryActivity !== undefined) fail(`unexpected entry activity ${extended.entryActivity}`);
console.log("OK   WF_Rental_rentalExtended: no entry activity");

// state machines without regions (derived entity types) yield no workflows
const active = pim.stateMachines?.find(sm => sm.name === "SM_ActiveRental") ?? fail("SM_ActiveRental not found");
if (planRegionWorkflows(active).length !== 0) fail("SM_ActiveRental should yield no workflows");
console.log("OK   SM_ActiveRental -> no workflows");

// every referenced microflow is a PIM activity (otherwise the CallMicroflowTask is silently skipped)
const activityNames = new Set((pim.stateMachines ?? []).flatMap(sm => (sm.activities ?? []).map(a => a.name)));
for (const sm of pim.stateMachines ?? []) {
  for (const p of planRegionWorkflows(sm)) {
    for (const mf of [p.setMicroflow, p.entryActivity]) {
      if (mf && !activityNames.has(mf)) fail(`${p.workflowName} references unknown activity ${mf}`);
    }
  }
}
console.log("OK   all Set/Create references resolve to PIM activities");

console.log("B11/B12 workflows OK");
