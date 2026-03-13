// Standalone test: loads rent-a-car-mock.json and runs the DEMO→PIM
// transformation without needing an MQTT broker.
//
// Run:
//   npx ts-node tests/test-transform.ts

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";
import type { DemoModel } from "../schemas/types";

const schemasDir = path.resolve(__dirname, "../schemas");
const ajv        = new Ajv({ allErrors: true });

const validateDemo = ajv.compile(JSON.parse(fs.readFileSync(path.join(schemasDir, "demo-schema.json"),   "utf-8")));
const validatePim  = ajv.compile(JSON.parse(fs.readFileSync(path.join(schemasDir, "pimuml-schema.json"), "utf-8")));

const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "rent-a-car-mock.json"), "utf-8")) as DemoModel;

console.log("INPUT: rent-a-car-mock.json");
console.log(`  name        : ${demo.name}`);
console.log(`  entityTypes : ${demo.entityTypes.length}`);

// Step 1 — validate input
if (!validateDemo(demo)) {
  console.error("INVALID input:");
  for (const e of validateDemo.errors ?? []) console.error(`  ${(e as any).dataPath} — ${e.message}`);
  process.exit(1);
}
console.log("\nStep 1 — input valid ✓");

// Step 2 — transform (A3 + A5)
const pim = {
  name: `${demo.name} – pimUML`,
  classes: demo.entityTypes.map(et => ({
    name: et.name,
    ownedAttributes: (et.attributes ?? []).map(a => ({ name: a.name, type: a.valueType ?? "String" })),
  })),
};

console.log("\nStep 2 — transform");
for (const cls of pim.classes) {
  const attrs = cls.ownedAttributes.map(a => `${a.name}: ${a.type}`).join(", ");
  console.log(`  • ${cls.name}  { ${attrs} }`);
}

// Step 3 — validate output
if (!validatePim(pim)) {
  console.error("\nINVALID output:");
  for (const e of validatePim.errors ?? []) console.error(`  ${(e as any).dataPath} — ${e.message}`);
  process.exit(1);
}
console.log("\nStep 3 — output valid ✓");

// Step 4 — write to disk
const outPath = path.resolve(__dirname, "rent-a-car-pim-from-bus.json");
fs.writeFileSync(outPath, JSON.stringify(pim, null, 2), "utf-8");
console.log(`\nOutput written to: tests/rent-a-car-pim-from-bus.json`);
