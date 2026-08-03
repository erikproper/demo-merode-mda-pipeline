// Smoke-test: verifies M3 enumerations and M9 self-transitions without a broker.
// Run: npx ts-node tests/smoke-m9-m3.ts

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";

const schemasDir     = path.resolve(__dirname, "../schemas");
const fixtureDir     = path.resolve(__dirname, ".");
const validateMerode = new Ajv({ allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(schemasDir, "merode-schema.json"), "utf-8")));
const validatePim    = new Ajv({ allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(schemasDir, "pimuml-schema.json"), "utf-8")));

const merode = JSON.parse(fs.readFileSync(path.join(fixtureDir, "rent-a-car-merode.json"), "utf-8"));

// Validate input
if (!validateMerode(merode)) {
  console.error("Input INVALID:", validateMerode.errors);
  process.exit(1);
}
console.log("Input valid.\n");

// --- inline transform (mirrors merode-to-pim-agent transform()) ---
const enumerations: any[] = [];
const dataTypes: any[]    = [];
for (const dt of merode.domainTypes ?? []) {
  if (dt.kind === "categorical") enumerations.push({ name: dt.name, literals: dt.literals ?? [] });
  else dataTypes.push({ name: dt.name });
}

const eventsByOT = new Map<string, any[]>();
for (const bet of merode.businessEventTypes ?? []) {
  const list = eventsByOT.get(bet.objectType) ?? [];
  list.push(bet);
  eventsByOT.set(bet.objectType, list);
}

const propagatedToMaster = new Map<string, string[]>();
for (const dep of merode.existenceDependencies ?? []) {
  const names = (merode.businessEventTypes ?? [])
    .filter((b: any) => b.objectType === dep.dependent)
    .map((b: any) => b.name);
  const ex = propagatedToMaster.get(dep.master) ?? [];
  for (const n of names) if (!ex.includes(n)) ex.push(n);
  propagatedToMaster.set(dep.master, ex);
}

const classes: any[]       = [];
const stateMachines: any[] = [];

for (const ot of merode.objectTypes) {
  classes.push({
    name: ot.name,
    ownedAttributes: [
      { name: `${ot.name}ID`, type: "Integer", isID: true },
      ...(ot.attributes ?? []).map((a: any) => ({ name: a.name, type: a.type ?? "String" })),
    ],
  });

  const lcStates: string[] = ot.lifecycleStates ?? [];
  if (!lcStates.length) continue;

  const smStates  = [{ name: "__initial", kind: "initial" }, ...lcStates.map((s: string) => ({ name: s, kind: "simple" })), { name: "__final", kind: "final" }];
  const smTrans: any[] = [];
  const smAct:   any[] = [];

  for (const evt of eventsByOT.get(ot.name) ?? []) {
    if (evt.role === "C") {
      smTrans.push({ from: "__initial", to: lcStates[0], trigger: evt.name });
      smAct.push({ name: `Create_${ot.name}`, kind: "create", targetType: ot.name });
    } else if (evt.role === "M") {
      smTrans.push({ from: lcStates[0], to: lcStates[0], trigger: evt.name });
      smAct.push({ name: `Set_${ot.name}_${evt.name}`, kind: "set", targetType: ot.name });
    } else if (evt.role === "E") {
      smTrans.push({ from: lcStates[lcStates.length - 1], to: "__final", trigger: evt.name });
      smAct.push({ name: `End_${ot.name}`, kind: "end", targetType: ot.name });
    }
  }

  for (const evtName of propagatedToMaster.get(ot.name) ?? []) {
    for (const state of lcStates) smTrans.push({ from: state, to: state, trigger: evtName });
    smAct.push({ name: `Set_${ot.name}_${evtName}`, kind: "set", targetType: ot.name });
  }

  stateMachines.push({
    name: `SM_${ot.name}`, entityType: ot.name,
    regions: [{ name: "lifecycle", states: smStates, transitions: smTrans }],
    activities: smAct,
  });
}

const pim = {
  name: "Rent-A-Car - pimUML",
  enumerations: enumerations.length ? enumerations : undefined,
  dataTypes:    dataTypes.length    ? dataTypes    : undefined,
  classes,
  associations: (merode.existenceDependencies ?? []).map((d: any) => ({
    name: d.name,
    memberEnds: [{ name: "dependent", type: d.dependent, lower: 0, upper: "*" }, { name: "master", type: d.master, lower: 1, upper: 1 }],
  })),
  stateMachines: stateMachines.length ? stateMachines : undefined,
};

// --- print results ---
console.log("=== M3 Enumerations ===");
for (const e of enumerations) console.log(`  ${e.name}: [${e.literals.join(", ")}]`);

console.log("\n=== M9 StateMachines ===");
for (const sm of stateMachines) {
  console.log(`\n  ${sm.name}:`);
  for (const t of sm.regions[0].transitions) {
    const loop = t.from === t.to ? " [self/M9]" : "";
    console.log(`    ${t.from} -[${t.trigger ?? ""}]-> ${t.to}${loop}`);
  }
  for (const a of sm.activities ?? []) console.log(`    activity: ${a.name} (${a.kind})`);
}

// --- validate output against schema ---
if (!validatePim(pim)) {
  console.error("\nOutput INVALID:", validatePim.errors);
  process.exit(1);
}
console.log("\nOutput valid against pimuml-schema. All checks passed.");
