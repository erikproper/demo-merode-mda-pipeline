/**
 * pim-to-mendix-agent.ts
 *
 * BIG Modelling Bus agent: pimUML (PIM) → Mendix (PSM)
 *
 * Pipeline:
 *   subscribe(model.pim.created)             ← PimModel artefact state
 *     → validate(pimuml-schema.json)         [AJV, Draft-07]
 *     → openWorkingCopy()                    [Mendix Platform SDK]
 *     → applyMappingRules(B1–B22)            [Table 11.1, 3_mapping_pim_to_mendix.md]
 *     → flushChanges() + commitToRepository  [Mendix Platform SDK]
 *
 * Mapping rules applied (Table 11.1):
 *   B1  Class                         → Entity (domain model)
 *   B2  Abstract Class                → Entity with documentation "[abstract]" (domain model)
 *   B3  Enumeration, EnumLiteral      → Enumeration + EnumerationValues (domain model)
 *   B4  User-defined data type        → Entity with documentation "[data type]" (domain model)
 *   B5  Association Class             → Entity + 2 Associations (domain model)
 *   B6  Property (isID == true)       → Attribute Integer (domain model)
 *   B7  Property (of Datatype)        → Attribute (domain model)
 *   B8  Property (of Class)           → Attribute (domain model)
 *   B9  Association                   → Association (domain model)
 *   B10 Generalization                → Generalization (domain model)
 *   B11 State Machine                 → ACR_ Microflow stub (microflow)
 *   B12 Region, Pseudostate           → [Workflow — not implemented, warns]
 *   B13 Activity                      → Microflow (microflow)
 *   B14 InitialNode                   → StartEvent (microflow)
 *   B15 ActivityFinalNode             → EndEvent (microflow)
 *   B16 Parameter/ActivityParamNode   → MicroflowParameterObject (microflow)
 *   B17 ValueSpecificationAction      → ChangeObjectAction stub (microflow)
 *   B18 AddStructuralFeatureValue     → ChangeObjectAction (microflow)
 *   B19 CreateLinkAction              → ChangeObjectAction stub (microflow)
 *   B20 CreateObjectAction            → CreateObjectAction (microflow)
 *   B21 ReadStructuralFeatureAction   → ChangeObjectAction stub (microflow)
 *   B22 Control flow                  → SequenceFlow (microflow)
 *   B23 Transition, Trigger           → [Workflow — not implemented, warns]
 *   B24 State entry activity          → [Workflow — not implemented, warns]
 *
 * Required environment variables:
 *   MENDIX_TOKEN          Mendix Personal Access Token (PAT) — used automatically by SDK
 *   MENDIX_APP_ID         App ID (UUID) — get from Developer Portal → General Settings
 *   MENDIX_MODULE_NAME    Target module name (default: "MyFirstModule")
 *   MENDIX_BRANCH         Branch name (default: "main" for Git, "trunk" for SVN)
 *
 * Optional environment variables (inherited from other agents):
 *   MQTT_BROKER, MQTT_PORT, MQTT_USER, MQTT_PASSWORD
 *   BUS_PREFIX, BUS_ENVIRONMENT_ID, BUS_AGENT_ID
 *   PIM_PUBLISHER_AGENT_ID  (default: "demo-to-pim-agent")
 *
 * Run:
 *   npx ts-node pim-to-mendix-agent.ts
 */

import path    from "path";
import fs      from "fs";
import Ajv     from "ajv";
import { IModel } from "mendixmodelsdk";
import { domainmodels, enumerations, microflows, datatypes } from "mendixmodelsdk";
import { MendixPlatformClient, OnlineWorkingCopy } from "mendixplatformsdk";
import { BusClient }        from "./bus-client";
import type {
  PimModel,
  PimClass,
  Activity,
  ActivityNode,
  CreateObjectAction     as PimCreateObjectAction,
  AddStructuralFeatureValueAction as PimAddStructuralFeatureValueAction,
  CreateLinkAction       as PimCreateLinkAction,
  ReadStructuralFeatureAction as PimReadStructuralFeatureAction,
  ValueSpecificationAction as PimValueSpecificationAction,
} from "./schemas/types";

// =============================================================================
// Configuration
// =============================================================================

const config = {
  broker:        process.env.MQTT_BROKER          ?? "localhost",
  port:          parseInt(process.env.MQTT_PORT   ?? "1883", 10),
  user:          process.env.MQTT_USER            ?? "admin",
  password:      process.env.MQTT_PASSWORD        ?? "admin",
  prefix:        process.env.BUS_PREFIX           ?? "big",
  environmentID: process.env.BUS_ENVIRONMENT_ID  ?? "dev",
  agentID:       process.env.BUS_AGENT_ID        ?? "pim-to-mendix-agent",
  loadDelayMs:   300,
};

const mendixConfig = {
  appId:      process.env.MENDIX_APP_ID      ?? "",
  moduleName: process.env.MENDIX_MODULE_NAME ?? "MyFirstModule",
  branch:     process.env.MENDIX_BRANCH      ?? "main",
};

/** Agent ID that publishes the PimModel on the bus. */
const PIM_PUBLISHER_AGENT_ID = process.env.PIM_PUBLISHER_AGENT_ID ?? "demo-to-pim-agent";
const PIM_ARTEFACT_ID        = "model.pim.created";

// =============================================================================
// JSON Schema validation (AJV)
// =============================================================================

const SCHEMAS_DIR = path.resolve(__dirname, "schemas");

function loadSchema(filename: string): object {
  return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), "utf-8"));
}

const ajv       = new Ajv({ allErrors: true });
const pimSchema = loadSchema("pimuml-schema.json");
const validatePim = ajv.compile(pimSchema);

function assertValid(
  validator: Ajv.ValidateFunction,
  data: unknown,
  label: string,
): void {
  if (!validator(data)) {
    const errors = validator.errors
      ?.map(e => `  ${(e as any).dataPath || "/"} ${e.message}`)
      .join("\n") ?? "";
    throw new Error(`[${label}] Validation failed:\n${errors}`);
  }
}

// =============================================================================
// Layout helpers  (auto-position canvas elements left→right)
// =============================================================================

const LAYOUT_Y    = 100;
const LAYOUT_STEP = 200;

const EVENT_SIZE  = { width: 20,  height: 20  };
const ACTION_SIZE = { width: 120, height: 40  };
const PARAM_SIZE  = { width: 120, height: 40  };

// =============================================================================
// Attribute type factory (B6 / B7 / B8)
// =============================================================================

function makeAttributeType(
  typeName: string | undefined,
  isID:     boolean,
  model:    IModel,
  enumMap:  Map<string, enumerations.Enumeration>,
): domainmodels.AttributeType {

  if (isID) {
    // B6: isID → Integer attribute (logical identifier)
    return domainmodels.IntegerAttributeType.create(model);
  }

  switch ((typeName ?? "").toLowerCase()) {
    case "integer":                     return domainmodels.IntegerAttributeType.create(model);
    case "long":                        return domainmodels.LongAttributeType.create(model);
    case "boolean":                     return domainmodels.BooleanAttributeType.create(model);
    case "decimal":
    case "float":                       return domainmodels.DecimalAttributeType.create(model);
    case "datetime":
    case "date":                        return domainmodels.DateTimeAttributeType.create(model);
    case "string":
    case "":                            return domainmodels.StringAttributeType.create(model);
  }

  // Check whether the type name matches a known Mendix Enumeration (B3 → EnumerationAttributeType)
  const mxEnum = enumMap.get(typeName ?? "");
  if (mxEnum) {
    const ea  = domainmodels.EnumerationAttributeType.create(model);
    ea.enumeration = mxEnum;
    return ea;
  }

  // Unknown type: fall back to String
  console.warn(`    ⚠ Unknown attribute type "${typeName}" → StringAttributeType (fallback)`);
  return domainmodels.StringAttributeType.create(model);
}

// =============================================================================
// Datatype factory  (for microflow parameter variable types)
// =============================================================================

function makeDatatypeFromString(typeName: string, model: IModel): datatypes.DataType {
  switch (typeName.toLowerCase()) {
    case "integer":    return datatypes.IntegerType.create(model);
    case "long":       return datatypes.IntegerType.create(model); // closest match
    case "boolean":    return datatypes.BooleanType.create(model);
    case "decimal":
    case "float":      return datatypes.DecimalType.create(model);
    case "datetime":
    case "date":       return datatypes.DateTimeType.create(model);
    case "string":
    default:           return datatypes.StringType.create(model);
  }
}

// =============================================================================
// Microflow helpers
// =============================================================================

function addStartEvent(
  mf: microflows.Microflow,
  x:  number,
): microflows.StartEvent {
  const ev = microflows.StartEvent.createIn(mf.objectCollection);
  ev.relativeMiddlePoint = { x, y: LAYOUT_Y };
  ev.size = EVENT_SIZE;
  return ev;
}

function addEndEvent(
  mf: microflows.Microflow,
  x:  number,
): microflows.EndEvent {
  const ev = microflows.EndEvent.createIn(mf.objectCollection);
  ev.relativeMiddlePoint = { x, y: LAYOUT_Y };
  ev.size = EVENT_SIZE;
  return ev;
}

function addSequenceFlow(
  mf:          microflows.Microflow,
  origin:      microflows.MicroflowObject,
  destination: microflows.MicroflowObject,
): microflows.SequenceFlow {
  const flow   = microflows.SequenceFlow.createIn(mf);
  flow.origin      = origin;
  flow.destination = destination;
  return flow;
}

// =============================================================================
// B13–B22: Activity → Microflow
// =============================================================================

function buildMicroflowFromActivity(
  activity: Activity,
  mxModule: any,          // projects.IFolderBase (Module)
  entityMap: Map<string, domainmodels.Entity>,
  enumMap:   Map<string, enumerations.Enumeration>,
  model:     IModel,
): void {
  const LOG = "[pim-to-mendix-agent]";
  console.log(`  [B13] Activity "${activity.name}" → Microflow`);

  const mf = microflows.Microflow.createIn(mxModule);
  mf.name  = activity.name;

  // name → canvas element  (for SequenceFlow wiring)
  const nodeMap = new Map<string, microflows.MicroflowObject>();

  let x = 0;

  // ---- B16: Activity parameters → MicroflowParameterObject (shown left-hand side) ----
  for (const param of activity.parameters ?? []) {
    if (param.direction !== "in" && param.direction !== "inout") continue;

    console.log(`    [B16] Parameter "${param.name}" (${param.type ?? "?"}, ${param.direction})`);

    const po  = microflows.MicroflowParameterObject.createIn(mf.objectCollection);
    po.name   = param.name;
    po.relativeMiddlePoint = { x, y: LAYOUT_Y };
    po.size   = PARAM_SIZE;

    if (param.type) {
      const ent = entityMap.get(param.type);
      if (ent) {
        const ot  = datatypes.ObjectType.create(model);
        ot.entity = ent;
        po.variableType = ot;
        console.log(`      → variableType: ObjectType(${param.type})`);
      } else {
        po.variableType = makeDatatypeFromString(param.type, model);
        console.log(`      → variableType: ${param.type}`);
      }
    }

    nodeMap.set(param.name, po);
    x += LAYOUT_STEP;
  }

  // ---- B14 / B15 / B17–B21: Activity nodes ----
  for (const node of activity.nodes ?? []) {
    let mfObj: microflows.MicroflowObject | null = null;

    switch (node._type) {

      // B14: InitialNode → StartEvent
      case "InitialNode": {
        console.log(`    [B14] InitialNode "${node.name}" → StartEvent`);
        const ev = addStartEvent(mf, x);
        mfObj = ev;
        break;
      }

      // B15: ActivityFinalNode → EndEvent
      case "ActivityFinalNode": {
        console.log(`    [B15] ActivityFinalNode "${node.name}" → EndEvent`);
        const ev = addEndEvent(mf, x);
        mfObj = ev;
        break;
      }

      // B16: ActivityParameterNode → map to already-created parameter object
      case "ActivityParameterNode": {
        const apn = node as { _type: string; name: string; parameter: string };
        const po  = nodeMap.get(apn.parameter);
        if (po) {
          nodeMap.set(node.name, po);   // alias: node name → param object
        } else {
          console.warn(`    ⚠ [B16] ActivityParameterNode "${node.name}": parameter "${apn.parameter}" not found in nodeMap`);
        }
        continue;   // no new canvas element
      }

      // B20: CreateObjectAction → Mendix CreateObjectAction
      case "CreateObjectAction": {
        const n = node as PimCreateObjectAction;
        console.log(`    [B20] CreateObjectAction "${n.name}" (${n.classifier})`);

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
          console.log(`      → entity: ${n.classifier}, output: "${action.outputVariableName}"`);
        } else {
          console.warn(`      ⚠ Entity "${n.classifier}" not found`);
        }

        mfObj = aa;
        break;
      }

      // B18: AddStructuralFeatureValueAction → ChangeObjectAction
      case "AddStructuralFeatureValueAction": {
        const n = node as PimAddStructuralFeatureValueAction;
        console.log(`    [B18] AddStructuralFeatureValueAction "${n.name}" (${n.object}.${n.structuralFeature})`);

        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = n.name;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        action.changeVariableName = n.object;

        mfObj = aa;
        break;
      }

      // B19: CreateLinkAction → ChangeObjectAction (set association)
      case "CreateLinkAction": {
        const n = node as PimCreateLinkAction;
        console.log(`    [B19] CreateLinkAction "${n.name}"`);

        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = n.name;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        action.changeVariableName = n.endData[0]?.value ?? "";

        mfObj = aa;
        break;
      }

      // B17: ValueSpecificationAction → ChangeObjectAction stub (value literal)
      case "ValueSpecificationAction": {
        const n = node as PimValueSpecificationAction;
        console.log(`    [B17] ValueSpecificationAction "${n.name}"`);

        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = n.name;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        action.changeVariableName = n.result ?? n.name;

        mfObj = aa;
        break;
      }

      // B21: ReadStructuralFeatureAction → ChangeObjectAction stub (retrieve)
      case "ReadStructuralFeatureAction": {
        const n = node as PimReadStructuralFeatureAction;
        console.log(`    [B21] ReadStructuralFeatureAction "${n.name}" (${n.object}.${n.structuralFeature})`);

        const aa = microflows.ActionActivity.createIn(mf.objectCollection);
        aa.relativeMiddlePoint = { x, y: LAYOUT_Y };
        aa.size = ACTION_SIZE;
        aa.caption = `${n.name} [read]`;
        aa.autoGenerateCaption = false;

        const action = microflows.ChangeObjectAction.createIn(aa);
        action.changeVariableName = n.object;

        mfObj = aa;
        break;
      }

      default:
        console.warn(`    ⚠ Unknown ActivityNode._type "${(node as any)._type}" — skipped`);
        continue;
    }

    if (mfObj) {
      nodeMap.set(node.name, mfObj);
      x += LAYOUT_STEP;
    }
  }

  // ---- B22: ControlFlow edges → SequenceFlows ----
  console.log(`    [B22] Wiring ${activity.edges?.length ?? 0} SequenceFlows …`);
  for (const edge of activity.edges ?? []) {
    const origin      = nodeMap.get(edge.source);
    const destination = nodeMap.get(edge.target);

    if (!origin || !destination) {
      console.warn(`      ⚠ Cannot wire "${edge.source}" → "${edge.target}" (node missing in nodeMap)`);
      continue;
    }

    addSequenceFlow(mf, origin, destination);
    console.log(`      → ${edge.source} → ${edge.target}`);
  }
}

// =============================================================================
// Main transformation: PIM → Mendix (B1–B24)
// =============================================================================

async function applyPimToMendix(
  pimModel:    PimModel,
  workingCopy: OnlineWorkingCopy,
  moduleName = mendixConfig.moduleName,
): Promise<void> {
  const LOG = "[pim-to-mendix-agent]";

  // ---------- Open model ----------
  console.log(`${LOG} Opening model …`);
  const model = await workingCopy.openModel();

  // ---------- Locate module ----------
  const mxModule = model.allModules().find(m => m.name === moduleName);
  if (!mxModule) {
    const available = model.allModules().map(m => m.name).join(", ");
    throw new Error(
      `Module "${moduleName}" not found in working copy.\n` +
      `Available modules: ${available}`,
    );
  }
  console.log(`${LOG} Target module: "${mxModule.name}"`);

  // ---------- Load domain model ----------
  // IDomainModel.load() returns Promise<DomainModel> (the concrete type),
  // which is required by Entity.createIn(), Association.createIn(), etc.
  const domainModel = await mxModule.domainModel.load();
  console.log(`${LOG} Domain model loaded.`);

  // ---------- Clear previous pipeline run (idempotent re-generation) ----------
  // Each run starts clean so entities/enumerations/microflows are never duplicated.
  // Deletion order: microflows first (may reference entities), then associations,
  // then entities, then enumerations.
  const modulePrefix = moduleName + ".";

  const prevMicroflows = model.allMicroflows().filter(
    mf => (mf.qualifiedName ?? "").startsWith(modulePrefix),
  );
  prevMicroflows.forEach(mf => mf.delete());
  console.log(`${LOG} ✓ Cleared ${prevMicroflows.length} microflow(s)`);

  const prevAssociations = [...domainModel.associations];
  prevAssociations.forEach(a => a.delete());
  console.log(`${LOG} ✓ Cleared ${prevAssociations.length} association(s)`);

  const prevEntities = [...domainModel.entities];
  prevEntities.forEach(e => e.delete());
  console.log(`${LOG} ✓ Cleared ${prevEntities.length} entity/entities`);

  const prevEnumerations = model.allEnumerations().filter(
    en => (en.qualifiedName ?? "").startsWith(modulePrefix),
  );
  prevEnumerations.forEach(en => en.delete());
  console.log(`${LOG} ✓ Cleared ${prevEnumerations.length} enumeration(s)`);

  // Maps for cross-rule references
  const entityMap = new Map<string, domainmodels.Entity>();
  const enumMap   = new Map<string, enumerations.Enumeration>();

  // Layout state for domain model (simple grid: 5 columns, auto rows)
  let entityCount = 0;
  const ENTITY_COL_COUNT = 5;
  const ENTITY_X_STEP    = 220;
  const ENTITY_Y_STEP    = 130;

  function entityLocation(): { x: number; y: number } {
    const col = entityCount % ENTITY_COL_COUNT;
    const row = Math.floor(entityCount / ENTITY_COL_COUNT);
    entityCount++;
    return { x: col * ENTITY_X_STEP, y: row * ENTITY_Y_STEP };
  }

  // =========================================================================
  // B3: Enumeration → Mendix Enumeration (must happen before B1/B2 attributes)
  // =========================================================================
  console.log(`\n${LOG} [B3] Mapping ${pimModel.enumerations?.length ?? 0} Enumerations …`);
  for (const pimEnum of pimModel.enumerations ?? []) {
    console.log(`  [B3] "${pimEnum.name}" (${pimEnum.literals?.length ?? 0} literals)`);

    const mxEnum = enumerations.Enumeration.createIn(mxModule);
    mxEnum.name  = pimEnum.name;

    for (const lit of pimEnum.literals ?? []) {
      const val  = enumerations.EnumerationValue.createIn(mxEnum);
      val.name   = lit.name;
      console.log(`    → "${lit.name}"`);
    }

    enumMap.set(pimEnum.name, mxEnum);
    console.log(`  ✓ Enumeration "${pimEnum.name}" created`);
  }

  // =========================================================================
  // B1 / B2: Class → Entity  (concrete and abstract)
  // =========================================================================
  console.log(`\n${LOG} [B1/B2] Mapping ${pimModel.classes?.length ?? 0} Classes → Entities …`);
  for (const cls of pimModel.classes ?? []) {
    const abstract = cls.isAbstract === true;
    const rule     = abstract ? "B2" : "B1";
    console.log(`  [${rule}] Class "${cls.name}"${abstract ? " [abstract]" : ""}`);

    const entity   = domainmodels.Entity.createIn(domainModel);
    entity.name    = cls.name;
    entity.location = entityLocation();

    // B2: Mendix has no native abstract flag — record it in documentation
    if (abstract) {
      entity.documentation = "[abstract]";
    }

    entityMap.set(cls.name, entity);
    console.log(`  ✓ Entity "${cls.name}" created`);
  }

  // =========================================================================
  // B4: PrimitiveType → Entity (user-defined data type)
  // =========================================================================
  console.log(`\n${LOG} [B4] Mapping ${pimModel.primitiveTypes?.length ?? 0} PrimitiveTypes → Entities …`);
  for (const pt of pimModel.primitiveTypes ?? []) {
    if (entityMap.has(pt.name)) {
      console.warn(`  ⚠ [B4] Entity "${pt.name}" already exists — skipping`);
      continue;
    }
    console.log(`  [B4] PrimitiveType "${pt.name}"`);

    const entity           = domainmodels.Entity.createIn(domainModel);
    entity.name            = pt.name;
    entity.location        = entityLocation();
    entity.documentation   = "[user-defined data type]";

    entityMap.set(pt.name, entity);
    console.log(`  ✓ Entity "${pt.name}" created`);
  }

  // =========================================================================
  // B5: AssociationClass → Entity + 2 Associations
  // =========================================================================
  console.log(`\n${LOG} [B5] Mapping ${pimModel.associationClasses?.length ?? 0} AssociationClasses …`);
  for (const ac of pimModel.associationClasses ?? []) {
    console.log(`  [B5] AssociationClass "${ac.name}"`);

    // Create entity for the association class (if not already present)
    if (!entityMap.has(ac.name)) {
      const entity         = domainmodels.Entity.createIn(domainModel);
      entity.name          = ac.name;
      entity.location      = entityLocation();
      entity.documentation = "[association class]";
      entityMap.set(ac.name, entity);
      console.log(`    ✓ Entity "${ac.name}" created (association class body)`);
    }

    const acEntity = entityMap.get(ac.name)!;

    // Create one association per memberEnd
    for (const end of ac.memberEnds) {
      const endEntity = entityMap.get(end.type ?? "");
      if (!endEntity) {
        console.warn(`    ⚠ [B5] Entity "${end.type}" not found — skipping association end`);
        continue;
      }
      const assoc  = domainmodels.Association.createIn(domainModel);
      assoc.name   = `${ac.name}_${end.type}`;
      assoc.parent = acEntity;
      assoc.child  = endEntity;
      assoc.type   = domainmodels.AssociationType.Reference;
      assoc.owner  = domainmodels.AssociationOwner.Default;
      console.log(`    → Association "${assoc.name}"`);
    }
  }

  // =========================================================================
  // B6 / B7 / B8: Properties → Attributes
  // =========================================================================
  console.log(`\n${LOG} [B6/B7/B8] Mapping Class attributes …`);
  for (const cls of pimModel.classes ?? []) {
    const entity = entityMap.get(cls.name);
    if (!entity) continue;

    for (const prop of cls.ownedAttributes ?? []) {
      const rule = prop.isID ? "B6" : "B8";
      console.log(`  [${rule}] ${cls.name}.${prop.name}: ${prop.type ?? "?"}`);

      const attr = domainmodels.Attribute.createIn(entity);
      attr.name  = prop.name;
      attr.type  = makeAttributeType(prop.type, prop.isID === true, model, enumMap);

      console.log(`    → Attribute "${attr.name}" (${attr.type.structureTypeName})`);
    }
  }

  // =========================================================================
  // B9: Association → Mendix Association
  // =========================================================================
  console.log(`\n${LOG} [B9] Mapping ${pimModel.associations?.length ?? 0} Associations …`);
  for (const assoc of pimModel.associations ?? []) {
    const [end1, end2] = assoc.memberEnds;

    const parentEnt = entityMap.get(end1.type ?? "");
    const childEnt  = entityMap.get(end2.type ?? "");

    if (!parentEnt || !childEnt) {
      const missing = !parentEnt ? end1.type : end2.type;
      console.warn(`  ⚠ [B9] Association "${assoc.name ?? "(unnamed)"}": entity "${missing}" not found — skipping`);
      continue;
    }

    const mxAssoc = domainmodels.Association.createIn(domainModel);
    const name    = assoc.name ?? `${end1.type ?? "X"}_${end2.type ?? "Y"}`;
    mxAssoc.name  = name;

    // parent side  =  end1,   child side = end2
    mxAssoc.parent = parentEnt;
    mxAssoc.child  = childEnt;

    // Many-to-many → ReferenceSet; otherwise → Reference
    const isMany2Many = (end1.upper === "*" || end1.upper === undefined) &&
                        (end2.upper === "*" || end2.upper === undefined);
    mxAssoc.type  = isMany2Many
      ? domainmodels.AssociationType.ReferenceSet
      : domainmodels.AssociationType.Reference;
    mxAssoc.owner = domainmodels.AssociationOwner.Default;

    console.log(`  [B9] "${name}": ${end1.type} → ${end2.type} (${mxAssoc.type})`);
  }

  // =========================================================================
  // B10: Generalization → Mendix Generalization
  // =========================================================================
  console.log(`\n${LOG} [B10] Mapping generalizations …`);
  for (const cls of pimModel.classes ?? []) {
    const childEnt = entityMap.get(cls.name);
    if (!childEnt) continue;

    for (const gen of cls.generalizations ?? []) {
      const parentEnt = entityMap.get(gen.general);
      if (!parentEnt) {
        console.warn(`  ⚠ [B10] Parent "${gen.general}" not found for "${cls.name}" — skipping`);
        continue;
      }

      console.log(`  [B10] ${cls.name} extends ${gen.general}`);
      const mxGen = domainmodels.Generalization.createIn(childEnt);
      // The Generalization element has a "generalization" property that references the parent entity
      mxGen.generalization = parentEnt;
      console.log(`    ✓ Generalization created`);
    }
  }

  // =========================================================================
  // B11: StateMachine → ACR_ Microflow stub
  // B12/B23/B24: Workflow features → not implemented (warns)
  // =========================================================================
  console.log(`\n${LOG} [B11] Mapping State Machines → ACR_ Microflows …`);
  for (const cls of pimModel.classes ?? []) {
    for (const sm of cls.ownedBehaviors ?? []) {
      const mfName = `ACR_${cls.name}_${sm.name}`;
      console.log(`  [B11] StateMachine "${sm.name}" of "${cls.name}" → Microflow "${mfName}"`);

      const mf = microflows.Microflow.createIn(mxModule);
      mf.name  = mfName;

      const start = addStartEvent(mf, 0);
      const end   = addEndEvent(mf, LAYOUT_STEP);
      addSequenceFlow(mf, start, end);

      // B12/B23/B24 check: warn if non-trivial regions/states/transitions present
      let hasNonTrivial = false;
      for (const region of sm.regions) {
        if ((region.subvertices?.length ?? 0) > 1 || (region.transitions?.length ?? 0) > 0) {
          hasNonTrivial = true;
          break;
        }
      }
      if (hasNonTrivial) {
        console.warn(
          `  ⚠ [B12/B23/B24] StateMachine "${sm.name}" has Regions/States/Transitions — ` +
          `Workflow mapping is not yet implemented. The ACR_ microflow is a stub.`,
        );
      }

      console.log(`  ✓ Microflow "${mfName}" created (stub)`);
    }
  }

  // =========================================================================
  // B13–B22: Activity → Microflow (detailed mapping)
  // =========================================================================
  console.log(`\n${LOG} [B13] Mapping Activities → Microflows …`);
  for (const cls of pimModel.classes ?? []) {
    for (const activity of cls.ownedActivities ?? []) {
      buildMicroflowFromActivity(activity, mxModule, entityMap, enumMap, model);
      console.log(`  ✓ Microflow "${activity.name}" created`);
    }
  }

  console.log(`\n${LOG} All B1–B22 mappings applied.`);

  // Flush all pending changes to the working copy server before committing
  console.log(`${LOG} Flushing model changes …`);
  await model.flushChanges();
  console.log(`${LOG} ✓ Changes flushed.`);
}

// =============================================================================
// Agent main
// =============================================================================

async function main(): Promise<void> {
  console.log("[pim-to-mendix-agent] Starting …");
  console.log(`[pim-to-mendix-agent] Will subscribe to "${PIM_ARTEFACT_ID}" from "${PIM_PUBLISHER_AGENT_ID}"`);
  console.log(`[pim-to-mendix-agent] Mendix target: app="${mendixConfig.appId || "(not set)"}", module="${mendixConfig.moduleName}", branch="${mendixConfig.branch}"`);

  if (!mendixConfig.appId) {
    console.warn(
      "[pim-to-mendix-agent] ⚠ MENDIX_APP_ID is not set.\n" +
      "  Mendix SDK calls will be skipped. Set MENDIX_APP_ID to enable PSM generation.",
    );
  }
  if (!process.env.MENDIX_TOKEN) {
    console.warn(
      "[pim-to-mendix-agent] ⚠ MENDIX_TOKEN is not set.\n" +
      "  The Mendix SDK will not be able to authenticate. Set MENDIX_TOKEN to enable PSM generation.",
    );
  }

  const bus = new BusClient(config);

  try {
    await bus.connect();
    console.log(`[pim-to-mendix-agent] Connected to MQTT broker ${config.broker}:${config.port}`);
  } catch (err) {
    console.error("[pim-to-mendix-agent] ✗ MQTT connection failed:", err);
    process.exit(1);
  }

  bus.subscribePimState(
    PIM_PUBLISHER_AGENT_ID,
    PIM_ARTEFACT_ID,
    async (pim: PimModel, timestamp: string) => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`[pim-to-mendix-agent] Received PimModel at ${timestamp}`);
      console.log(`  name:               "${pim.name}"`);
      console.log(`  classes:            ${pim.classes?.length ?? 0}`);
      console.log(`  associations:       ${pim.associations?.length ?? 0}`);
      console.log(`  associationClasses: ${pim.associationClasses?.length ?? 0}`);
      console.log(`  enumerations:       ${pim.enumerations?.length ?? 0}`);
      console.log(`  primitiveTypes:     ${pim.primitiveTypes?.length ?? 0}`);

      // ── Step 1: Extract optional _target and validate payload ────────────
      // Strip _target before AJV validation (pimuml-schema uses additionalProperties:false).
      // Values from _target override the module-level mendixConfig for this request.
      const target = (pim as any)._target as
        { appId?: string; moduleName?: string; branch?: string } | undefined;
      if (target) {
        delete (pim as any)._target;
        console.log(`[pim-to-mendix-agent]   _target override: ${JSON.stringify(target)}`);
      }

      const effectiveConfig = {
        appId:      target?.appId      ?? mendixConfig.appId,
        moduleName: target?.moduleName ?? mendixConfig.moduleName,
        branch:     target?.branch     ?? mendixConfig.branch,
      };

      try {
        assertValid(validatePim, pim, "pimuml-schema.json");
        console.log("[pim-to-mendix-agent] ✓ Payload valid against pimuml-schema.json");
      } catch (err) {
        console.error("[pim-to-mendix-agent] ✗ Validation failed — aborting transformation");
        console.error((err as Error).message);
        return;
      }

      // ── Step 2: Guard: credentials must be set ────────────────────────────
      if (!effectiveConfig.appId) {
        console.warn("[pim-to-mendix-agent] ⚠ MENDIX_APP_ID not set — skipping Mendix SDK transform");
        return;
      }

      console.log(`[pim-to-mendix-agent]   target app="${effectiveConfig.appId}", module="${effectiveConfig.moduleName}", branch="${effectiveConfig.branch}"`);

      // ── Step 3: Create Mendix working copy ───────────────────────────────
      let workingCopy: OnlineWorkingCopy;
      try {
        console.log("[pim-to-mendix-agent] Creating temporary Mendix working copy …");
        const client = new MendixPlatformClient();
        const app    = client.getApp(effectiveConfig.appId);
        workingCopy  = await app.createTemporaryWorkingCopy(effectiveConfig.branch);
        console.log("[pim-to-mendix-agent] ✓ Working copy created");
      } catch (err) {
        console.error("[pim-to-mendix-agent] ✗ Failed to create working copy:", (err as Error).message);
        return;
      }

      // ── Step 4: Apply B1–B22 mapping rules ────────────────────────────────
      try {
        await applyPimToMendix(pim, workingCopy, effectiveConfig.moduleName);
        console.log("[pim-to-mendix-agent] ✓ Mapping complete");
      } catch (err) {
        console.error("[pim-to-mendix-agent] ✗ Mapping error:", (err as Error).message);
        console.error((err as Error).stack ?? "");
        return;
      }

      // ── Step 5: Commit to Mendix ──────────────────────────────────────────
      try {
        console.log("[pim-to-mendix-agent] Committing to Mendix repository …");
        await workingCopy.commitToRepository(effectiveConfig.branch, {
          commitMessage: `pim-to-mendix: pimUML → Mendix for "${pim.name}" (${timestamp})`,
        });
        console.log(`[pim-to-mendix-agent] ✓ Committed to branch "${effectiveConfig.branch}"`);
      } catch (err) {
        console.error("[pim-to-mendix-agent] ✗ Commit failed:", (err as Error).message);
      }

      console.log(`${"=".repeat(60)}\n`);
    },
  );

  console.log("[pim-to-mendix-agent] Listening … (Ctrl+C to stop)");
}

// Only start when run directly (not when imported by tests)
if (require.main === module) {
  main().catch(err => {
    console.error("[pim-to-mendix-agent] Unhandled error:", err);
    process.exit(1);
  });
}
