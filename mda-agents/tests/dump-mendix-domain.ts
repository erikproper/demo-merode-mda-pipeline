// dump-mendix-domain
// Read-only Gegenprobe zum pim-to-mendix-agent: oeffnet dieselbe Mendix-App ueber das
// Platform SDK und serialisiert den aktuellen Stand des Moduls nach JSON.
//
// Zweck: die Artefaktzahlen in thesis-notes/EVAL/FRAMEWORK.md stammen bisher aus dem
// Log des erzeugenden Agenten selbst. Dieses Skript liest den Zielzustand unabhaengig
// aus dem Team Server zurueck und macht ihn damit maschinell nachpruefbar.
//
// Es wird nichts geschrieben und nichts committed - die temporaere Working Copy wird
// nur gelesen.
//
// Aufruf:  npx ts-node -r dotenv/config tests/dump-mendix-domain.ts <basisname> [--deep]

import { IModel } from "mendixmodelsdk";
import { MendixPlatformClient } from "mendixplatformsdk";
import * as fs from "fs";
import * as path from "path";

const mendixConfig = {
  appId:      process.env.MENDIX_APP_ID      ?? "",
  moduleName: process.env.MENDIX_MODULE_NAME ?? "MyFirstModule",
  branch:     process.env.MENDIX_BRANCH      ?? "main",
};

const OUT_DIR = path.resolve(__dirname, "../../thesis-notes/EVAL/Eval_new");

const args = process.argv.slice(2);
const deep = args.includes("--deep");
const base = args.filter(a => !a.startsWith("--"))[0] ?? "mendix-dump";

// "DomainModels$StringAttributeType" -> "String"
function shortType(raw: string | undefined, suffix: string): string {
  if (!raw) return "Unknown";
  return (raw.split("$").pop() ?? raw).replace(new RegExp(`${suffix}$`), "");
}

function attributeType(t: any): string {
  const short = shortType(t?.structureTypeName, "AttributeType");
  if (short === "Enumeration") return `Enumeration(${t?.enumeration?.name ?? "?"})`;
  return short;
}

function defaultValue(attr: any): string | undefined {
  try {
    const v = attr?.value?.defaultValue;
    return v === undefined || v === null || v === "" ? undefined : String(v);
  } catch {
    return undefined;
  }
}

function enumName(e: any): string {
  // AbstractEnum-Instanzen tragen ihren Namen in .name, sonst String-Fallback
  return e?.name ?? String(e);
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

async function readModule(model: IModel, moduleName: string) {
  const mxModule = model.allModules().find(m => m.name === moduleName);
  if (!mxModule) throw new Error(`Module "${moduleName}" not found`);

  const domainModel = await mxModule.domainModel.load();
  const prefix = moduleName + ".";

  const entities = domainModel.entities.map(e => {
    const gen = e.generalization as any;
    const parent =
      gen && gen.structureTypeName && gen.structureTypeName.endsWith("$Generalization")
        ? gen.generalization?.name ?? null
        : null;
    return {
      name: e.name,
      generalization: parent,
      attributes: e.attributes
        .map(a => ({
          name: a.name,
          type: attributeType(a.type),
          defaultValue: defaultValue(a),
        }))
        .sort(byName),
    };
  }).sort(byName);

  const associations = domainModel.associations.map(a => ({
    name: a.name,
    // Mendix SDK: parent = Viele-Seite (haelt den Verweis), child = Eins-Seite
    parent: (a.parent as any)?.name ?? null,
    child: (a.child as any)?.name ?? null,
    type: enumName(a.type),
    owner: enumName(a.owner),
  })).sort(byName);

  const enumerationUnits = model
    .allEnumerations()
    .filter(en => (en.qualifiedName ?? "").startsWith(prefix));
  const enums: { name: string; literals: string[] }[] = [];
  for (const en of enumerationUnits) {
    const loaded = await en.load();
    enums.push({ name: loaded.name, literals: loaded.values.map(v => v.name) });
  }
  enums.sort(byName);

  const microflowUnits = model
    .allMicroflows()
    .filter(mf => (mf.qualifiedName ?? "").startsWith(prefix));

  const microflows: { name: string; actions?: Record<string, number> }[] = [];
  for (const mf of microflowUnits) {
    if (!deep) {
      microflows.push({ name: mf.name });
      continue;
    }
    const loaded: any = await mf.load();
    const actions: Record<string, number> = {};
    for (const obj of loaded.objectCollection?.objects ?? []) {
      const action = obj?.action;
      const key = action
        ? shortType(action.structureTypeName, "")
        : shortType(obj?.structureTypeName, "");
      actions[key] = (actions[key] ?? 0) + 1;
    }
    microflows.push({ name: loaded.name, actions });
  }
  microflows.sort(byName);

  const workflows = model
    .allWorkflows()
    .filter(wf => (wf.qualifiedName ?? "").startsWith(prefix))
    .map(wf => wf.name)
    .sort();

  const pages = model
    .allPages()
    .filter(p => (p.qualifiedName ?? "").startsWith(prefix))
    .map(p => p.name)
    .sort();

  return { entities, associations, enumerations: enums, microflows, workflows, pages };
}

async function main(): Promise<void> {
  if (!mendixConfig.appId) throw new Error("MENDIX_APP_ID is not set");

  console.log(`[dump-mendix-domain] app ${mendixConfig.appId}, branch ${mendixConfig.branch}, module ${mendixConfig.moduleName}`);
  const app = new MendixPlatformClient().getApp(mendixConfig.appId);
  const workingCopy = await app.createTemporaryWorkingCopy(mendixConfig.branch);
  const model = await workingCopy.openModel();

  const dump = await readModule(model, mendixConfig.moduleName);

  const attributeCount = dump.entities.reduce((n, e) => n + e.attributes.length, 0);
  const result = {
    readAt: new Date().toISOString(),
    appId: mendixConfig.appId,
    branch: mendixConfig.branch,
    module: mendixConfig.moduleName,
    deep,
    counts: {
      entities: dump.entities.length,
      attributes: attributeCount,
      associations: dump.associations.length,
      generalizations: dump.entities.filter(e => e.generalization).length,
      enumerations: dump.enumerations.length,
      microflows: dump.microflows.length,
      workflows: dump.workflows.length,
      pages: dump.pages.length,
    },
    ...dump,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${base}.mendix.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");

  console.log("[dump-mendix-domain] counts:", JSON.stringify(result.counts));
  console.log(`[dump-mendix-domain] wrote ${outFile}`);
}

main().catch(err => {
  console.error("[dump-mendix-domain] failed:", err);
  process.exit(1);
});
