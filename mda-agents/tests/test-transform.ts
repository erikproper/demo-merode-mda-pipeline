// Standalone test: loads rent-a-car-demo.json and runs the DEMO->PIM
// transformation without needing an MQTT broker.
//
// Run:
//   npx ts-node tests/test-transform.ts

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";
import type { DemoModel } from "../schemas/types";

const schemasDir   = path.resolve(__dirname, "../schemas");
const ajv          = new Ajv({ allErrors: true });
const validateDemo = ajv.compile(JSON.parse(fs.readFileSync(path.join(schemasDir, "demo-schema.json"),   "utf-8")));
const validatePim  = ajv.compile(JSON.parse(fs.readFileSync(path.join(schemasDir, "pimuml-schema.json"), "utf-8")));

const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "rent-a-car-demo.json"), "utf-8")) as DemoModel;

console.log("INPUT: rent-a-car-demo.json");
console.log(`  entityTypes : ${demo.entityTypes.length}`);
console.log(`  factTypes   : ${demo.factTypes?.length ?? 0}`);

if (!validateDemo(demo)) {
  console.error("INVALID input:");
  for (const e of validateDemo.errors ?? []) console.error(`  ${(e as any).dataPath} - ${e.message}`);
  process.exit(1);
}
console.log("\nStep 1 - input valid");

// A3 + A5: entity types -> classes with attributes
// A12:     fact types   -> associations
const pim = {
  name: `${demo.name} – pimUML`,
  classes: demo.entityTypes.map(et => ({
    name: et.name,
    ownedAttributes: (et.attributes ?? []).map(a => ({ name: a.name, type: a.valueType ?? "String" })),
  })),
  associations: (demo.factTypes ?? []).map(ft => ({
    name: ft.name,
    memberEnds: [
      { name: ft.roles[0].name, type: ft.roles[0].entityType, lower: ft.roles[0].lower ?? 0, upper: ft.roles[0].upper ?? "*" },
      { name: ft.roles[1].name, type: ft.roles[1].entityType, lower: ft.roles[1].lower ?? 1, upper: ft.roles[1].upper ?? 1  },
    ],
  })),
};

console.log("\nStep 2 - transform");
for (const cls of pim.classes) {
  const attrs = cls.ownedAttributes.map(a => `${a.name}: ${a.type}`).join(", ");
  console.log(`  - Class       ${cls.name}  { ${attrs} }`);
}
for (const assoc of pim.associations) {
  const [e0, e1] = assoc.memberEnds;
  console.log(`  - Association ${assoc.name}  (${e0.type} ${e0.lower}..${e0.upper} - ${e1.type} ${e1.lower}..${e1.upper})`);
}

if (!validatePim(pim)) {
  console.error("\nINVALID output:");
  for (const e of validatePim.errors ?? []) console.error(`  ${(e as any).dataPath} - ${e.message}`);
  process.exit(1);
}
console.log("\nStep 3 - output valid");

const outPath = path.resolve(__dirname, "rent-a-car-pim-from-bus.json");
fs.writeFileSync(outPath, JSON.stringify(pim, null, 2), "utf-8");
console.log(`\nOutput written to: tests/rent-a-car-pim-from-bus.json`);
