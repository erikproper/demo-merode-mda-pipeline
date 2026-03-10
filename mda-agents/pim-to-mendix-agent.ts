// Agent C — pimUML (PIM) → Mendix (PSM)
//
// Listens for a PIM model on the bus, validates it, opens a temporary
// Mendix working copy, applies mapping rules B1–B22, and commits the result.
//
// Mapping rules (thesis Table 11.1):
//   B1  Class                      → Entity
//   B2  Abstract class             → Entity (documented as "[abstract]")
//   B3  Enumeration                → Mendix Enumeration
//   B4  PrimitiveType              → Entity (documented as "[data type]")
//   B5  AssociationClass           → Entity + 2 Associations
//   B6  Property (isID)            → Integer attribute "logicalId"
//   B7  Property (data type)       → Attribute
//   B8  Property (class type)      → Attribute
//   B9  Association                → Mendix Association
//   B10 Generalization             → Mendix Generalization
//   B11 StateMachine               → ACR_ microflow stub
//   B12 Region/Pseudostate         → not implemented (warns)
//   B13 Activity                   → Microflow
//   B14 InitialNode                → StartEvent
//   B15 ActivityFinalNode          → EndEvent
//   B16 Parameter/ActivityParamNode→ MicroflowParameterObject
//   B17 ValueSpecificationAction   → skipped (literal, no Mendix canvas element)
//   B18 AddStructuralFeatureValue  → ChangeObjectAction
//   B19 CreateLinkAction           → ChangeObjectAction stub
//   B20 CreateObjectAction         → CreateObjectAction
//   B21 ReadStructuralFeatureAction→ ChangeObjectAction stub
//   B22 ControlFlow edges          → SequenceFlow
//   B23 Transition/Trigger         → not implemented (warns)
//   B24 State entry activity       → not implemented (warns)
//
// Required env vars:
//   MENDIX_TOKEN         personal access token
//   MENDIX_APP_ID        app UUID (from Developer Portal)
//   MENDIX_MODULE_NAME   target module (default: "MyFirstModule")
//   MENDIX_BRANCH        branch (default: "main")

import { IModel } from "mendixmodelsdk";
import { domainmodels, enumerations, microflows, datatypes } from "mendixmodelsdk";
import { MendixPlatformClient, OnlineWorkingCopy } from "mendixplatformsdk";
import { BusClient } from "./bus-client";
import type {
  PimModel,
  Activity,
  CreateObjectAction             as PimCreateObjectAction,
  AddStructuralFeatureValueAction as PimAddStructuralFeatureValueAction,
  CreateLinkAction               as PimCreateLinkAction,
  ReadStructuralFeatureAction    as PimReadStructuralFeatureAction,
  ValueSpecificationAction       as PimValueSpecificationAction,
} from "./schemas/types";
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

// Canvas layout constants for positioning elements left-to-right.
const LAYOUT_Y    = 100;
const LAYOUT_STEP = 200;
const EVENT_SIZE  = { width: 20,  height: 20 };
const ACTION_SIZE = { width: 120, height: 40 };
const PARAM_SIZE  = { width: 120, height: 40 };

// B6/B7/B8 — map a PIM property type string to a Mendix AttributeType.
function makeAttributeType(
  typeName: string | undefined,
  isID:     boolean,
  model:    IModel,
  enumMap:  Map<string, enumerations.Enumeration>,
): domainmodels.AttributeType {
  if (isID) return domainmodels.IntegerAttributeType.create(model);

  switch ((typeName ?? "").toLowerCase()) {
    case "integer":            return domainmodels.IntegerAttributeType.create(model);
    case "long":               return domainmodels.LongAttributeType.create(model);
    case "boolean":            return domainmodels.BooleanAttributeType.create(model);
    case "decimal": case "float":   return domainmodels.DecimalAttributeType.create(model);
    case "datetime": case "date":   return domainmodels.DateTimeAttributeType.create(model);
    case "string": case "":         return domainmodels.StringAttributeType.create(model);
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

// Map a type name to a Mendix DataType (used for microflow parameter types).
function makeDatatypeFromString(typeName: string, model: IModel): datatypes.DataType {
  switch (typeName.toLowerCase()) {
    case "integer": case "long": return datatypes.IntegerType.create(model);
    case "boolean":              return datatypes.BooleanType.create(model);
    case "decimal": case "float": return datatypes.DecimalType.create(model);
    case "datetime": case "date": return datatypes.DateTimeType.create(model);
    default:                      return datatypes.StringType.create(model);
  }
}

function addStartEvent(mf: microflows.Microflow, x: number): microflows.StartEvent {
  const ev = microflows.StartEvent.createIn(mf.objectCollection);
  ev.relativeMiddlePoint = { x, y: LAYOUT_Y };
  ev.size = EVENT_SIZE;
  return ev;
}

function addEndEvent(mf: microflows.Microflow, x: number): microflows.EndEvent {
  const ev = microflows.EndEvent.createIn(mf.objectCollection);
  ev.relativeMiddlePoint = { x, y: LAYOUT_Y };
  ev.size = EVENT_SIZE;
  return ev;
}

// B22 helpers — resolve through ActivityParameterNodes to find real control-flow endpoints.
// In UML, control flow can route through parameter nodes (data pins), but in Mendix
// SequenceFlows can only connect StartEvent/EndEvent/ActionActivity — never parameters.
// These functions walk backward/forward through the edge list to find the nearest real node.
function resolveRealSource(
  name: string,
  edges: Array<{ source: string; target: string }>,
  paramNodeNames: Set<string>,
  visited = new Set<string>(),
): string | null {
  if (visited.has(name)) return null;
  visited.add(name);
  if (!paramNodeNames.has(name)) return name;
  for (const e of edges) {
    if (e.target === name) {
      const resolved = resolveRealSource(e.source, edges, paramNodeNames, visited);
      if (resolved) return resolved;
    }
  }
  return null;
}

function resolveRealTarget(
  name: string,
  edges: Array<{ source: string; target: string }>,
  paramNodeNames: Set<string>,
  visited = new Set<string>(),
): string | null {
  if (visited.has(name)) return null;
  visited.add(name);
  if (!paramNodeNames.has(name)) return name;
  for (const e of edges) {
    if (e.source === name) {
      const resolved = resolveRealTarget(e.target, edges, paramNodeNames, visited);
      if (resolved) return resolved;
    }
  }
  return null;
}

function addSequenceFlow(
  mf:   microflows.Microflow,
  from: microflows.MicroflowObject,
  to:   microflows.MicroflowObject,
): void {
  const flow   = microflows.SequenceFlow.createIn(mf);
  flow.origin      = from;
  flow.destination = to;
}

// B13–B22 — convert one PIM activity diagram into a Mendix microflow.
function buildMicroflowFromActivity(
  activity: Activity,
  mxModule: any,
  entityMap: Map<string, domainmodels.Entity>,
  enumMap:   Map<string, enumerations.Enumeration>,
  model:     IModel,
): void {
  console.log(`  [B13] "${activity.name}" → Microflow`);

  const mf = microflows.Microflow.createIn(mxModule);
  mf.name  = activity.name.replace(/\./g, "_"); // dots are not allowed in Mendix names

  // nodeMap: UML node name → Mendix canvas object (needed for SequenceFlow wiring)
  // varNameMap: UML node name → Mendix variable name (needed for action references)
  // paramNodeNames: parameter nodes are not valid SequenceFlow endpoints in Mendix
  const nodeMap        = new Map<string, microflows.MicroflowObject>();
  const varNameMap     = new Map<string, string>();
  const paramNodeNames = new Set<string>();
  let x = 0;

  // B16 — parameters first, positioned on the left side of the canvas
  for (const param of activity.parameters ?? []) {
    if (param.direction !== "in" && param.direction !== "inout") continue;

    const po = microflows.MicroflowParameterObject.createIn(mf.objectCollection);
    po.name  = param.name;
    po.relativeMiddlePoint = { x, y: LAYOUT_Y };
    po.size  = PARAM_SIZE;

    if (param.type) {
      const ent = entityMap.get(param.type);
      if (ent) {
        const ot  = datatypes.ObjectType.create(model);
        ot.entity = ent;
        po.variableType = ot;
      } else {
        po.variableType = makeDatatypeFromString(param.type, model);
      }
    }

    nodeMap.set(param.name, po);
    varNameMap.set(param.name, param.name);
    paramNodeNames.add(param.name);
    x += LAYOUT_STEP;
  }

  // B14/B15/B17–B21 — one pass through the activity nodes
  for (const node of activity.nodes ?? []) {
    let mfObj: microflows.MicroflowObject | null = null;

    switch (node._type) {

      // B14
      case "InitialNode": {
        mfObj = addStartEvent(mf, x);
        break;
      }

      // B15
      case "ActivityFinalNode": {
        mfObj = addEndEvent(mf, x);
        break;
      }

      // B16 — the ActivityParameterNode is just an alias for an already-created parameter.
      // No new canvas element — just register the alias so edges can reference it.
      case "ActivityParameterNode": {
        const apn = node as { name: string; parameter: string };
        const po  = nodeMap.get(apn.parameter);
        if (po) {
          nodeMap.set(node.name, po);
          varNameMap.set(node.name, varNameMap.get(apn.parameter) ?? apn.parameter);
        } else {
          console.warn(`    ⚠ [B16] parameter "${apn.parameter}" not found for node "${node.name}"`);
        }
        paramNodeNames.add(node.name);
        continue;
      }

      // B20
      case "CreateObjectAction": {
        const n  = node as PimCreateObjectAction;
        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = n.name;
        aa.autoGenerateCaption = false;

        const action = microflows.CreateObjectAction.createIn(aa);
        const ent    = entityMap.get(n.classifier);
        if (ent) {
          action.entity             = ent;
          action.outputVariableName = n.result ?? `New${n.classifier}`;
          varNameMap.set(node.name, action.outputVariableName);
          if (n.result) varNameMap.set(n.result, action.outputVariableName);
        } else {
          console.warn(`      ⚠ entity "${n.classifier}" not found`);
        }
        mfObj = aa;
        break;
      }

      // B18
      case "AddStructuralFeatureValueAction": {
        const n  = node as PimAddStructuralFeatureValueAction;
        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = n.name;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        // varNameMap resolves UML node names to actual Mendix variable names (fixes CE0109)
        action.changeVariableName = varNameMap.get(n.object) ?? n.object;
        action.commit = microflows.CommitEnum.Yes;
        mfObj = aa;
        break;
      }

      // B19
      case "CreateLinkAction": {
        const n  = node as PimCreateLinkAction;
        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = n.name;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        action.changeVariableName =
          varNameMap.get(n.endData[0]?.value ?? "") ??
          varNameMap.get(n.endData[1]?.value ?? "") ??
          (n.endData[0]?.value ?? "Variable");
        action.commit = microflows.CommitEnum.Yes;
        mfObj = aa;
        break;
      }

      // B17 — ValueSpecificationAction has no Mendix equivalent as a standalone node.
      // Literals are used inline in action expressions. Just register the output pin.
      case "ValueSpecificationAction": {
        const n = node as PimValueSpecificationAction;
        if (n.result) varNameMap.set(n.result, n.result);
        break;
      }

      // B21
      case "ReadStructuralFeatureAction": {
        const n  = node as PimReadStructuralFeatureAction;
        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = `${n.name} [read]`;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        action.changeVariableName = varNameMap.get(n.object) ?? n.object;
        action.commit = microflows.CommitEnum.Yes;
        mfObj = aa;
        break;
      }

      default:
        console.warn(`    ⚠ unknown node type "${(node as any)._type}" — skipped`);
        continue;
    }

    if (mfObj) {
      nodeMap.set(node.name, mfObj);
      x += LAYOUT_STEP;
    }
  }

  // B22 — wire SequenceFlows, resolving through any ActivityParameterNodes in the path.
  // Mendix only allows StartEvent/EndEvent/ActionActivity as SequenceFlow endpoints.
  const allEdges  = activity.edges ?? [];
  const seenFlows = new Set<string>();

  for (const edge of allEdges) {
    const sourceName = resolveRealSource(edge.source, allEdges, paramNodeNames) ?? edge.source;
    const targetName = resolveRealTarget(edge.target, allEdges, paramNodeNames) ?? edge.target;

    if (paramNodeNames.has(sourceName) || paramNodeNames.has(targetName)) continue;
    if (sourceName === targetName) continue;

    const flowKey = `${sourceName}→${targetName}`;
    if (seenFlows.has(flowKey)) continue;
    seenFlows.add(flowKey);

    const from = nodeMap.get(sourceName);
    const to   = nodeMap.get(targetName);
    if (!from || !to) {
      console.warn(`      ⚠ cannot wire "${sourceName}" → "${targetName}" (node not found)`);
      continue;
    }
    addSequenceFlow(mf, from, to);
  }
}

// Apply all B1–B22 mapping rules to produce a Mendix domain model + microflows.
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
  // Order matters: delete microflows first (they reference entities), then
  // associations, then entities, then enumerations.
  const prefix = moduleName + ".";

  const oldMicroflows = model.allMicroflows().filter(mf => (mf.qualifiedName ?? "").startsWith(prefix));
  oldMicroflows.forEach(mf => mf.delete());
  console.log(`[pim-to-mendix] cleared ${oldMicroflows.length} microflow(s)`);

  const oldAssocs = [...domainModel.associations];
  oldAssocs.forEach(a => a.delete());

  const oldEntities = [...domainModel.entities];
  oldEntities.forEach(e => e.delete());
  console.log(`[pim-to-mendix] cleared ${oldEntities.length} entity/entities, ${oldAssocs.length} association(s)`);

  const oldEnums = model.allEnumerations().filter(en => (en.qualifiedName ?? "").startsWith(prefix));
  oldEnums.forEach(en => en.delete());
  console.log(`[pim-to-mendix] cleared ${oldEnums.length} enumeration(s)`);

  const entityMap = new Map<string, domainmodels.Entity>();
  const enumMap   = new Map<string, enumerations.Enumeration>();

  // Simple grid layout: 5 entities per row, auto-incrementing position.
  let entityCount = 0;
  const entityPos = () => {
    const col = entityCount % 5;
    const row = Math.floor(entityCount++ / 5);
    return { x: col * 220, y: row * 130 };
  };

  // B3 — enumerations must be created before attributes that reference them
  for (const pimEnum of pimModel.enumerations ?? []) {
    const mxEnum = enumerations.Enumeration.createIn(mxModule);
    mxEnum.name  = pimEnum.name;
    for (const lit of pimEnum.literals ?? []) {
      enumerations.EnumerationValue.createIn(mxEnum).name = lit.name;
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

  // B4 — primitive types → entities (marked as data types)
  for (const pt of pimModel.primitiveTypes ?? []) {
    if (entityMap.has(pt.name)) continue;
    const entity = domainmodels.Entity.createIn(domainModel);
    entity.name          = pt.name;
    entity.location      = entityPos();
    entity.documentation = "[user-defined data type]";
    entityMap.set(pt.name, entity);
    console.log(`  [B4] Entity "${pt.name}" (data type)`);
  }

  // B5 — association classes → entity + two associations
  for (const ac of pimModel.associationClasses ?? []) {
    if (!entityMap.has(ac.name)) {
      const entity = domainmodels.Entity.createIn(domainModel);
      entity.name          = ac.name;
      entity.location      = entityPos();
      entity.documentation = "[association class]";
      entityMap.set(ac.name, entity);
    }
    const acEntity = entityMap.get(ac.name)!;
    for (const end of ac.memberEnds) {
      const endEntity = entityMap.get(end.type ?? "");
      if (!endEntity) { console.warn(`    ⚠ [B5] entity "${end.type}" not found`); continue; }
      const assoc  = domainmodels.Association.createIn(domainModel);
      assoc.name   = `${ac.name}_${end.type}`;
      assoc.parent = acEntity;
      assoc.child  = endEntity;
      assoc.type   = domainmodels.AssociationType.Reference;
      assoc.owner  = domainmodels.AssociationOwner.Default;
    }
    console.log(`  [B5] AssociationClass "${ac.name}"`);
  }

  // B6/B7/B8 — properties → attributes
  for (const cls of pimModel.classes ?? []) {
    const entity = entityMap.get(cls.name);
    if (!entity) continue;

    // Child entities (those with a generalization) inherit the parent's id — don't re-add it.
    const isChild = (cls.generalizations?.length ?? 0) > 0;

    for (const prop of cls.ownedAttributes ?? []) {
      if (prop.name === "id" && prop.isID && isChild) {
        console.log(`  [B6] skipping inherited "id" on child "${cls.name}"`);
        continue;
      }

      // Mendix reserves the word "id" — rename it to logicalId on root entities.
      const attrName = (prop.name === "id" && prop.isID) ? "logicalId" : prop.name;
      const attr = domainmodels.Attribute.createIn(entity);
      attr.name  = attrName;
      attr.type  = makeAttributeType(prop.type, prop.isID === true, model, enumMap);

      // Boolean attributes require an explicit default value in Mendix (CE7247).
      if (attr.type instanceof domainmodels.BooleanAttributeType) {
        domainmodels.StoredValue.createIn(attr).defaultValue = "false";
      }
      console.log(`  [B${prop.isID ? "6" : "8"}] ${cls.name}.${attrName}`);
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
    const mxAssoc = domainmodels.Association.createIn(domainModel);
    let assocName = assoc.name ?? `${end1.type}_${end2.type}`;
    // CE0065: Mendix checks entity/association names case-insensitively — rename if collision
    const lowerName = assocName.toLowerCase();
    if ([...entityMap.keys()].some(e => e.toLowerCase() === lowerName)) {
      assocName = `${end1.type}_${end2.type}`;
    }
    mxAssoc.name   = assocName;
    mxAssoc.parent = parentEnt;
    mxAssoc.child  = childEnt;
    const isM2M = (end1.upper === "*" || end1.upper === undefined) &&
                  (end2.upper === "*" || end2.upper === undefined);
    mxAssoc.type  = isM2M ? domainmodels.AssociationType.ReferenceSet : domainmodels.AssociationType.Reference;
    mxAssoc.owner = domainmodels.AssociationOwner.Default;
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

  // B11 — state machines → ACR_ microflow stubs
  for (const cls of pimModel.classes ?? []) {
    for (const sm of cls.ownedBehaviors ?? []) {
      const mfName = `ACR_${cls.name}_${sm.name}`;
      const mf = microflows.Microflow.createIn(mxModule);
      mf.name  = mfName;
      addSequenceFlow(mf, addStartEvent(mf, 0), addEndEvent(mf, LAYOUT_STEP));

      const hasDetails = sm.regions.some(r =>
        (r.subvertices?.length ?? 0) > 1 || (r.transitions?.length ?? 0) > 0,
      );
      if (hasDetails) {
        console.warn(`  ⚠ [B12/B23/B24] "${sm.name}" has states/transitions — workflow mapping not yet implemented`);
      }
      console.log(`  [B11] Microflow "${mfName}" (stub)`);
    }
  }

  // B13–B22 — activities → microflows
  for (const cls of pimModel.classes ?? []) {
    for (const activity of cls.ownedActivities ?? []) {
      buildMicroflowFromActivity(activity, mxModule, entityMap, enumMap, model);
    }
  }

  console.log("[pim-to-mendix] all rules applied — flushing changes …");
  await model.flushChanges();
}

async function main() {
  console.log("[pim-to-mendix] starting");
  console.log(`[pim-to-mendix] Mendix target: app="${mendixConfig.appId || "(not set)"}", module="${mendixConfig.moduleName}", branch="${mendixConfig.branch}"`);

  if (!mendixConfig.appId)        console.warn("[pim-to-mendix] ⚠ MENDIX_APP_ID not set — will skip Mendix transform");
  if (!process.env.MENDIX_TOKEN)  console.warn("[pim-to-mendix] ⚠ MENDIX_TOKEN not set — SDK will not authenticate");

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[pim-to-mendix] connected to ${config.broker}:${config.port}`);

  bus.subscribePimState(SOURCE_AGENT_ID, IN_ARTEFACT, async (rawModel: PimModel, timestamp: string) => {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`[pim-to-mendix] received model at ${timestamp}`);

    // Strip metadata before schema validation, then use it to build effectiveConfig.
    const { clean: pim, meta } = extractMeta(rawModel);
    if (meta._target) console.log(`[pim-to-mendix]   target override: ${JSON.stringify(meta._target)}`);

    try {
      assertValid(validatePim, pim, "pimuml-schema.json");
    } catch (err) {
      console.error("[pim-to-mendix] invalid input:", (err as Error).message);
      return;
    }

    // _target values from the HTTP request take priority over env var defaults.
    const effectiveConfig = {
      appId:      meta._target?.appId      ?? mendixConfig.appId,
      moduleName: meta._target?.moduleName ?? mendixConfig.moduleName,
      branch:     meta._target?.branch     ?? mendixConfig.branch,
    };

    if (!effectiveConfig.appId) {
      console.warn("[pim-to-mendix] no appId — skipping");
      return;
    }

    console.log(`[pim-to-mendix]   → app="${effectiveConfig.appId}", module="${effectiveConfig.moduleName}", branch="${effectiveConfig.branch}"`);

    let workingCopy: OnlineWorkingCopy;
    try {
      console.log("[pim-to-mendix] creating working copy …");
      const app   = new MendixPlatformClient().getApp(effectiveConfig.appId);
      workingCopy = await app.createTemporaryWorkingCopy(effectiveConfig.branch);
      console.log("[pim-to-mendix] working copy ready");
    } catch (err) {
      console.error("[pim-to-mendix] failed to create working copy:", (err as Error).message);
      return;
    }

    try {
      await applyPimToMendix(pim, workingCopy, effectiveConfig.moduleName);
    } catch (err) {
      console.error("[pim-to-mendix] mapping failed:", (err as Error).message);
      console.error((err as Error).stack ?? "");
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

    console.log(`${"─".repeat(60)}\n`);
  });

  console.log("[pim-to-mendix] listening … (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[pim-to-mendix] unhandled error:", err);
    process.exit(1);
  });
}
