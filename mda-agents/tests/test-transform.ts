/**
 * test-transform.ts
 *
 * Standalone test: lädt rent-a-car-mock.json und führt die DEMO→pimUML
 * Transformation aus, ohne einen MQTT-Broker zu benötigen.
 *
 * Run:
 *   npm run test:transform
 *   -- oder --
 *   npx ts-node tests/test-transform.ts
 */

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";
import { transform } from "../demo-to-pim-agent";
import type { DemoModel } from "../schemas/types";

// ---------------------------------------------------------------------------
// Setup AJV validators
// ---------------------------------------------------------------------------

const schemasDir = path.resolve(__dirname, "../schemas");

const ajv = new Ajv({ allErrors: true });

const demoSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "demo-schema.json"),   "utf-8"));
const pimSchema  = JSON.parse(fs.readFileSync(path.join(schemasDir, "pimuml-schema.json"), "utf-8"));

const validateDemo = ajv.compile(demoSchema);
const validatePim  = ajv.compile(pimSchema);

// ---------------------------------------------------------------------------
// Load mock
// ---------------------------------------------------------------------------

const mockPath = path.resolve(__dirname, "rent-a-car-mock.json");
const demo = JSON.parse(fs.readFileSync(mockPath, "utf-8")) as DemoModel;

console.log("=".repeat(60));
console.log("INPUT: rent-a-car-mock.json");
console.log("=".repeat(60));
console.log(`  name          : ${demo.name}`);
console.log(`  entityTypes   : ${demo.entityTypes.length}`);
console.log(`  valueTypes    : ${demo.valueTypes?.length ?? 0}`);
console.log(`  generalizations: ${demo.generalizations?.length ?? 0}`);
console.log(`  aggregations  : ${demo.aggregations?.length ?? 0}`);
console.log(`  propertyTypes : ${demo.propertyTypes?.length ?? 0}`);

// ---------------------------------------------------------------------------
// Step 1: Validate input
// ---------------------------------------------------------------------------

console.log("\n" + "-".repeat(60));
console.log("STEP 1 — Validate input against demo-schema.json");
console.log("-".repeat(60));

if (validateDemo(demo)) {
  console.log("  ✓ VALID");
} else {
  console.error("  ✗ INVALID:");
  for (const e of validateDemo.errors ?? []) {
    console.error(`    ${(e as any).dataPath || "/"} — ${e.message}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 2: Transform (A1–A12)
// ---------------------------------------------------------------------------

console.log("\n" + "-".repeat(60));
console.log("STEP 2 — Transform (A1–A12)");
console.log("-".repeat(60));

const pim = transform(demo);

console.log(`  classes           : ${pim.classes.length}`);
console.log(`  associations      : ${pim.associations.length}`);
console.log(`  associationClasses: ${pim.associationClasses.length}`);
console.log(`  enumerations      : ${pim.enumerations.length}`);
console.log(`  primitiveTypes    : ${pim.primitiveTypes.length}`);

console.log("\n  Classes generated:");
for (const cls of pim.classes) {
  const attrs   = cls.ownedAttributes?.length  ?? 0;
  const regions = cls.ownedBehaviors?.[0]?.regions.length ?? 0;
  const acts    = cls.ownedActivities?.length   ?? 0;
  const abs     = cls.isAbstract ? " [abstract]" : "";
  const gens    = cls.generalizations?.map(g => g.general).join(", ") ?? "";
  console.log(
    `    • ${cls.name}${abs}` +
    (gens ? ` extends ${gens}` : "") +
    `  (attrs: ${attrs}, SM-regions: ${regions}, activities: ${acts})`
  );
}

console.log("\n  Associations generated:");
for (const assoc of pim.associations) {
  const [a, b] = assoc.memberEnds;
  console.log(
    `    • ${assoc.name ?? "(unnamed)"}` +
    `  ${a.type}[${a.lower ?? "?"}..${a.upper ?? "?"}]` +
    ` — ${b.type}[${b.lower ?? "?"}..${b.upper ?? "?"}]`
  );
}

// ---------------------------------------------------------------------------
// Step 3: Validate output
// ---------------------------------------------------------------------------

console.log("\n" + "-".repeat(60));
console.log("STEP 3 — Validate output against pimuml-schema.json");
console.log("-".repeat(60));

if (validatePim(pim)) {
  console.log("  ✓ VALID");
} else {
  console.error("  ✗ INVALID:");
  for (const e of validatePim.errors ?? []) {
    console.error(`    ${(e as any).dataPath || "/"} — ${e.message}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 4: Write output to disk
// ---------------------------------------------------------------------------

const outPath = path.resolve(__dirname, "rent-a-car-pim.json");
fs.writeFileSync(outPath, JSON.stringify(pim, null, 2), "utf-8");

console.log("\n" + "=".repeat(60));
console.log("OUTPUT written to: tests/rent-a-car-pim.json");
console.log("=".repeat(60));
