// pim-to-mendix-agent
// Listens on the bus for pimUML models and writes them into a Mendix app via the Platform SDK.

import { IModel, domainmodels, enumerations } from "mendixmodelsdk";
import { MendixPlatformClient, OnlineWorkingCopy } from "mendixplatformsdk";
import { BusClient } from "./bus-client";
import type { PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta } from "./agent-utils";

const config = getBusConfig("pim-to-mendix-agent");

const mendixConfig = {
  appId:      process.env.MENDIX_APP_ID      ?? "",
  moduleName: process.env.MENDIX_MODULE_NAME ?? "MyFirstModule",
  branch:     process.env.MENDIX_BRANCH      ?? "main",
};

const SOURCE_AGENT_ID = process.env.PIM_PUBLISHER_AGENT_ID ?? "demo-to-pim-agent";
const IN_ARTEFACT     = "model.pim.created";

const validatePim = makeValidator("pimuml-schema.json");

function makeAttributeType(
  typeName: string | undefined,
  model: IModel,
  enumMap: Map<string, enumerations.Enumeration>,
): domainmodels.AttributeType {
  const name = typeName ?? "";
  if (enumMap.has(name)) {
    const attrType = domainmodels.EnumerationAttributeType.create(model);
    attrType.enumeration = enumMap.get(name)!;
    return attrType;
  }
  switch (name.toLowerCase()) {
    case "integer":  return domainmodels.IntegerAttributeType.create(model);
    case "boolean":  return domainmodels.BooleanAttributeType.create(model);
    case "datetime": return domainmodels.DateTimeAttributeType.create(model);
    default:         return domainmodels.StringAttributeType.create(model);
  }
}

async function applyPimToMendix(
  pimModel:    PimModel,
  workingCopy: OnlineWorkingCopy,
  moduleName = mendixConfig.moduleName,
): Promise<void> {
  const model = await workingCopy.openModel();

  const mxModule = model.allModules().find(m => m.name === moduleName);
  if (!mxModule) throw new Error(`Module "${moduleName}" not found`);

  const domainModel = await mxModule.domainModel.load();

  // Delete everything from a previous run.
  const prefix = moduleName + ".";
  [...domainModel.associations].forEach(a => a.delete());
  [...domainModel.entities].forEach(e => e.delete());
  model.allEnumerations().filter(en => (en.qualifiedName ?? "").startsWith(prefix)).forEach(en => en.delete());
  console.log("[pim-to-mendix] cleared previous model");

  // enumerations → Mendix enumerations (A1)
  const enumMap = new Map<string, enumerations.Enumeration>();
  for (const enumDef of pimModel.enumerations ?? []) {
    const mxEnum = enumerations.Enumeration.createIn(mxModule);
    mxEnum.name  = enumDef.name;
    for (const literal of enumDef.literals) {
      const val  = enumerations.EnumerationValue.createIn(mxEnum);
      val.name   = literal;
    }
    enumMap.set(enumDef.name, mxEnum);
    console.log(`  + enumeration "${enumDef.name}" [${enumDef.literals.join(", ")}]`);
  }

  // classes → Mendix entities with attributes
  const entityMap = new Map<string, domainmodels.Entity>();
  let x = 0;
  for (const cls of pimModel.classes ?? []) {
    const entity    = domainmodels.Entity.createIn(domainModel);
    entity.name     = cls.name;
    entity.location = { x, y: 0 };
    x += 220;
    entityMap.set(cls.name, entity);

    if (cls.isAbstract) console.log(`  (abstract) "${cls.name}" — Mendix has no abstract entities; marked in pimUML only`);

    for (const prop of cls.ownedAttributes ?? []) {
      const attr = domainmodels.Attribute.createIn(entity);
      attr.name  = prop.name;
      attr.type  = makeAttributeType(prop.type, model, enumMap);
      if (prop.defaultValue !== undefined && attr.value instanceof domainmodels.StoredValue) {
        (attr.value as domainmodels.StoredValue).defaultValue = prop.defaultValue;
      }
      console.log(`  + attribute ${cls.name}.${prop.name} : ${prop.type ?? "String"}${prop.defaultValue !== undefined ? ` = ${prop.defaultValue}` : ""}`);
    }

    console.log(`  + entity "${cls.name}"`);
  }

  // generalizations → Mendix entity inheritance (A10)
  for (const gen of pimModel.generalizations ?? []) {
    const childEntity  = entityMap.get(gen.child);
    const parentEntity = entityMap.get(gen.parent);
    if (!childEntity || !parentEntity) {
      console.warn(`  skipping generalization "${gen.child} → ${gen.parent}" — entity not found`);
      continue;
    }
    const mxGen = domainmodels.Generalization.createIn(childEntity);
    mxGen.generalization = parentEntity;
    console.log(`  + generalization "${gen.child}" extends "${gen.parent}"`);
  }

  // associations → Mendix associations
  for (const assoc of pimModel.associations ?? []) {
    const end0 = assoc.memberEnds[0];
    const end1 = assoc.memberEnds[1];

    // parent = the "one" side (upper === 1), child = the "many" side (upper === "*")
    const [parentEnd, childEnd] = end0.upper === "*" ? [end1, end0] : [end0, end1];

    const parentEntity = entityMap.get(parentEnd.type);
    const childEntity  = entityMap.get(childEnd.type);

    if (!parentEntity || !childEntity) {
      console.warn(`  skipping association "${assoc.name}" — entity not found`);
      continue;
    }

    const mxAssoc  = domainmodels.Association.createIn(domainModel);
    mxAssoc.name   = assoc.name;
    mxAssoc.parent = parentEntity;
    mxAssoc.child  = childEntity;
    console.log(`  + association "${assoc.name}": ${parentEnd.type} → ${childEnd.type}`);
  }

  await model.flushChanges();
}

async function main() {
  console.log("[pim-to-mendix] starting");
  console.log(`[pim-to-mendix] target: app="${mendixConfig.appId || "(not set)"}", module="${mendixConfig.moduleName}", branch="${mendixConfig.branch}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[pim-to-mendix] connected to ${config.broker}:${config.port}`);

  bus.subscribePimState(SOURCE_AGENT_ID, IN_ARTEFACT, async (rawModel: PimModel, timestamp: string) => {
    console.log(`[pim-to-mendix] received model at ${timestamp}`);

    const { clean: pim, meta } = extractMeta(rawModel);

    if (meta._trace && meta._trace.length > 0) {
      console.log(`[pim-to-mendix] trace (${meta._trace.length} entries):`);
      for (const entry of meta._trace) {
        console.log(`  ${entry.sourceType} "${entry.sourceName}" → ${entry.targetType} "${entry.targetName}"`);
      }
    }

    try {
      assertValid(validatePim, pim, "pimuml-schema.json");
    } catch (err) {
      console.error("[pim-to-mendix] invalid input:", (err as Error).message);
      return;
    }

    const effectiveConfig = {
      appId:      meta._target?.appId      ?? mendixConfig.appId,
      moduleName: meta._target?.moduleName ?? mendixConfig.moduleName,
      branch:     meta._target?.branch     ?? mendixConfig.branch,
    };

    if (!effectiveConfig.appId) {
      console.warn("[pim-to-mendix] no appId — skipping");
      return;
    }

    let workingCopy: OnlineWorkingCopy;
    try {
      const app   = new MendixPlatformClient().getApp(effectiveConfig.appId);
      workingCopy = await app.createTemporaryWorkingCopy(effectiveConfig.branch);
    } catch (err) {
      console.error("[pim-to-mendix] failed to create working copy:", (err as Error).message);
      return;
    }

    try {
      await applyPimToMendix(pim, workingCopy, effectiveConfig.moduleName);
    } catch (err) {
      console.error("[pim-to-mendix] mapping failed:", (err as Error).message);
      return;
    }

    try {
      await workingCopy.commitToRepository(effectiveConfig.branch, {
        commitMessage: `pim-to-mendix: generated from "${pim.name}" (${timestamp})`,
      });
      console.log(`[pim-to-mendix] committed to branch "${effectiveConfig.branch}"`);
    } catch (err) {
      console.error("[pim-to-mendix] commit failed:", (err as Error).message);
    }
  });

  console.log("[pim-to-mendix] listening … (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[pim-to-mendix] unhandled error:", err);
    process.exit(1);
  });
}
