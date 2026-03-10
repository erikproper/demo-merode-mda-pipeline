// Agent C — pimUML (PIM) → Mendix (PSM)
//
// Listens for a PIM model on the bus, validates it, opens a temporary
// Mendix working copy, applies the domain model mapping rules, and commits.
//
// Mapping rules implemented:
//   B1  Class                → Entity
//   B2  Abstract class       → Entity (documented as "[abstract]")
//   B3  Enumeration          → Mendix Enumeration
//   B6  Property (isID)      → Integer attribute "logicalId"
//   B7  Property (data type) → Attribute
//   B8  Property (class type)→ Attribute (String fallback)
//   B9  Association          → Mendix Association
//   B10 Generalization       → Mendix Generalization
//
// Required env vars:
//   MENDIX_TOKEN         personal access token
//   MENDIX_APP_ID        app UUID (from Developer Portal)
//   MENDIX_MODULE_NAME   target module (default: "MyFirstModule")
//   MENDIX_BRANCH        branch (default: "main")

import { IModel } from "mendixmodelsdk";
import { domainmodels, enumerations, texts } from "mendixmodelsdk";
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

// B6/B7/B8 — map a PIM property type string to a Mendix AttributeType.
function makeAttributeType(
  typeName: string | undefined,
  isID:     boolean,
  model:    IModel,
  enumMap:  Map<string, enumerations.Enumeration>,
): domainmodels.AttributeType {
  if (isID) return domainmodels.IntegerAttributeType.create(model);

  switch ((typeName ?? "").toLowerCase()) {
    case "integer":                    return domainmodels.IntegerAttributeType.create(model);
    case "long":                       return domainmodels.LongAttributeType.create(model);
    case "boolean":                    return domainmodels.BooleanAttributeType.create(model);
    case "decimal": case "float":      return domainmodels.DecimalAttributeType.create(model);
    case "datetime": case "date":      return domainmodels.DateTimeAttributeType.create(model);
    case "string":  case "":           return domainmodels.StringAttributeType.create(model);
  }

  const mxEnum = enumMap.get(typeName ?? "");
  if (mxEnum) {
    const ea = domainmodels.EnumerationAttributeType.create(model);
    ea.enumeration = mxEnum;
    return ea;
  }

  console.warn(`    ⚠ unknown type "${typeName}" — falling back to String`);
  return domainmodels.StringAttributeType.create(model);
}

// Apply B1–B10 mapping rules to produce a Mendix domain model.
async function applyPimToMendix(
  pimModel:    PimModel,
  workingCopy: OnlineWorkingCopy,
  moduleName = mendixConfig.moduleName,
): Promise<void> {
  const model = await workingCopy.openModel();

  const mxModule = model.allModules().find(m => m.name === moduleName);
  if (!mxModule) {
    const available = model.allModules().map(m => m.name).join(", ");
    throw new Error(`Module "${moduleName}" not found. Available: ${available}`);
  }
  console.log(`[pim-to-mendix] target module: "${moduleName}"`);

  const domainModel = await mxModule.domainModel.load();

  // Delete everything from a previous run so we start clean each time.
  // Order matters: associations reference entities, so delete associations first.
  const prefix = moduleName + ".";

  const oldMicroflows = model.allMicroflows().filter(mf => (mf.qualifiedName ?? "").startsWith(prefix));
  oldMicroflows.forEach(mf => mf.delete());

  const oldAssocs = [...domainModel.associations];
  oldAssocs.forEach(a => a.delete());

  const oldEntities = [...domainModel.entities];
  oldEntities.forEach(e => e.delete());
  console.log(`[pim-to-mendix] cleared ${oldEntities.length} entities, ${oldAssocs.length} associations, ${oldMicroflows.length} microflows`);

  const oldEnums = model.allEnumerations().filter(en => (en.qualifiedName ?? "").startsWith(prefix));
  oldEnums.forEach(en => en.delete());
  console.log(`[pim-to-mendix] cleared ${oldEnums.length} enumerations`);

  const entityMap = new Map<string, domainmodels.Entity>();
  const enumMap   = new Map<string, enumerations.Enumeration>();

  // Grid layout: 5 entities per row.
  let entityCount = 0;
  const entityPos = () => {
    const col = entityCount % 5;
    const row = Math.floor(entityCount++ / 5);
    return { x: col * 220, y: row * 130 };
  };

  // B3 — enumerations (must come before attributes that reference them)
  for (const pimEnum of pimModel.enumerations ?? []) {
    const mxEnum = enumerations.Enumeration.createIn(mxModule);
    mxEnum.name  = pimEnum.name;
    for (const lit of pimEnum.literals ?? []) {
      const enumVal = enumerations.EnumerationValue.createIn(mxEnum);
      enumVal.name  = lit.name;
      const t = texts.Translation.createIn(enumVal.caption);
      t.languageCode = "en_US";
      t.text         = lit.name;
    }
    enumMap.set(pimEnum.name, mxEnum);
    console.log(`  [B3] Enumeration "${pimEnum.name}"`);
  }

  // B1/B2 — classes → entities
  for (const cls of pimModel.classes ?? []) {
    if (entityMap.has(cls.name)) {
      console.warn(`  ⚠ [B1] "${cls.name}" already exists — skipping duplicate`);
      continue;
    }
    const entity = domainmodels.Entity.createIn(domainModel);
    entity.name     = cls.name;
    entity.location = entityPos();
    if (cls.isAbstract) entity.documentation = "[abstract]";
    entityMap.set(cls.name, entity);
    console.log(`  [${cls.isAbstract ? "B2" : "B1"}] Entity "${cls.name}"`);
  }

  // B6/B7/B8 — properties → attributes
  for (const cls of pimModel.classes ?? []) {
    const entity  = entityMap.get(cls.name);
    if (!entity) continue;
    const isChild = (cls.generalizations?.length ?? 0) > 0;

    for (const prop of cls.ownedAttributes ?? []) {
      if (prop.name === "id" && prop.isID && isChild) continue; // inherited from parent

      const attrName = (prop.name === "id" && prop.isID) ? "logicalId" : prop.name;
      const attr = domainmodels.Attribute.createIn(entity);
      attr.name  = attrName;
      attr.type  = makeAttributeType(prop.type, prop.isID === true, model, enumMap);

      if (attr.type instanceof domainmodels.BooleanAttributeType) {
        domainmodels.StoredValue.createIn(attr).defaultValue = "false";
      }
      console.log(`  [B${prop.isID ? "6" : "7/8"}] ${cls.name}.${attrName}`);
    }
  }

  // B9 — associations
  for (const assoc of pimModel.associations ?? []) {
    const [end1, end2] = assoc.memberEnds;
    const parentEnt = entityMap.get(end1.type ?? "");
    const childEnt  = entityMap.get(end2.type ?? "");
    if (!parentEnt || !childEnt) {
      console.warn(`  ⚠ [B9] "${assoc.name ?? "?"}" skipped — entity not found`);
      continue;
    }

    let assocName = assoc.name ?? `${end1.type}_${end2.type}`;
    // Mendix checks entity/association names case-insensitively (CE0065) — rename if collision
    if ([...entityMap.keys()].some(e => e.toLowerCase() === assocName.toLowerCase())) {
      assocName = `${end1.type}_${end2.type}`;
    }

    const mxAssoc  = domainmodels.Association.createIn(domainModel);
    mxAssoc.name   = assocName;
    mxAssoc.parent = parentEnt;
    mxAssoc.child  = childEnt;
    const isM2M    = (end1.upper === "*" || end1.upper === undefined) &&
                     (end2.upper === "*" || end2.upper === undefined);
    mxAssoc.type   = isM2M ? domainmodels.AssociationType.ReferenceSet : domainmodels.AssociationType.Reference;
    mxAssoc.owner  = domainmodels.AssociationOwner.Default;
    console.log(`  [B9] Association "${mxAssoc.name}"`);
  }

  // B10 — generalizations
  for (const cls of pimModel.classes ?? []) {
    const childEnt = entityMap.get(cls.name);
    if (!childEnt) continue;
    for (const gen of cls.generalizations ?? []) {
      const parentEnt = entityMap.get(gen.general);
      if (!parentEnt) { console.warn(`  ⚠ [B10] parent "${gen.general}" not found`); continue; }
      domainmodels.Generalization.createIn(childEnt).generalization = parentEnt;
      console.log(`  [B10] ${cls.name} extends ${gen.general}`);
    }
  }

  console.log("[pim-to-mendix] all rules applied — flushing changes …");
  await model.flushChanges();
}

async function main() {
  console.log("[pim-to-mendix] starting");
  console.log(`[pim-to-mendix] target: app="${mendixConfig.appId || "(not set)"}", module="${mendixConfig.moduleName}", branch="${mendixConfig.branch}"`);

  if (!mendixConfig.appId)       console.warn("[pim-to-mendix] ⚠ MENDIX_APP_ID not set — will skip Mendix transform");
  if (!process.env.MENDIX_TOKEN) console.warn("[pim-to-mendix] ⚠ MENDIX_TOKEN not set — SDK will not authenticate");

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[pim-to-mendix] connected to ${config.broker}:${config.port}`);

  bus.subscribePimState(SOURCE_AGENT_ID, IN_ARTEFACT, async (rawModel: PimModel, timestamp: string) => {
    console.log(`[pim-to-mendix] received model at ${timestamp}`);

    const { clean: pim, meta } = extractMeta(rawModel);
    if (meta._target) console.log(`[pim-to-mendix] target override: ${JSON.stringify(meta._target)}`);

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

    console.log(`[pim-to-mendix] → app="${effectiveConfig.appId}", module="${effectiveConfig.moduleName}", branch="${effectiveConfig.branch}"`);

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
