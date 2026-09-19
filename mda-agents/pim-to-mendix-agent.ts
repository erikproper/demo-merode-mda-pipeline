// pim-to-mendix-agent
// Listens on the bus for pimUML models and writes them into a Mendix app via the Platform SDK.
//
// Rule IDs B1-B16 follow the prototype numbering in thesis-notes/MAPPING_NOTES.md (Section 5).
// Where a rule bundles several rules of Bzowski's Table 11.1 (B1-B24), those are named as "Bzowski Bn".

import { IModel, domainmodels, enumerations, microflows, workflows, datatypes, pages, navigation, menus, texts } from "mendixmodelsdk";
import { MendixPlatformClient, OnlineWorkingCopy } from "mendixplatformsdk";
import { BusClient } from "./bus-client";
import type { PimModel, PimRegion, PimStateMachine } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta } from "./agent-utils";

const config = getBusConfig("pim-to-mendix-agent");

const mendixConfig = {
  appId:      process.env.MENDIX_APP_ID      ?? "",
  moduleName: process.env.MENDIX_MODULE_NAME ?? "MyFirstModule",
  branch:     process.env.MENDIX_BRANCH      ?? "main",
};

const PIM_SOURCE_AGENTS = (process.env.PIM_PUBLISHER_AGENT_IDS ?? "demo-to-pim-agent,merode-to-pim-agent").split(",");
const IN_ARTEFACT       = "model.pim.created";

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
    case "integer":          return domainmodels.IntegerAttributeType.create(model);
    case "boolean":          return domainmodels.BooleanAttributeType.create(model);
    case "datetime":         return domainmodels.DateTimeAttributeType.create(model);
    case "real":
    case "decimal":          return domainmodels.DecimalAttributeType.create(model);
    default:                 return domainmodels.StringAttributeType.create(model);
  }
}

// Used for microflows
function makeParameterType(
  typeName: string | undefined,
  model: IModel,
  enumMap: Map<string, enumerations.Enumeration>,
): datatypes.DataType {
  const name = typeName ?? "";
  if (enumMap.has(name)) {
    const t = datatypes.EnumerationType.create(model);
    t.enumeration = enumMap.get(name)!;
    return t;
  }
  switch (name.toLowerCase()) {
    case "integer":          return datatypes.IntegerType.create(model);
    case "boolean":          return datatypes.BooleanType.create(model);
    case "datetime":         return datatypes.DateTimeType.create(model);
    case "real":
    case "decimal":          return datatypes.DecimalType.create(model);
    default:                 return datatypes.StringType.create(model);
  }
}

function isMerodeFSM(sm: PimModel["stateMachines"] extends Array<infer S> ? S : never): boolean {
  return sm.regions.length > 0 && sm.regions.every(r => !r.forEvent);
}

// B15: status target of a MERODE set-activity. Self-transitions are ignored, so an
// M9-propagated event (one self-transition per lifecycle state of the master) or an
// M event that keeps the state yields undefined - the status must then stay unchanged.
export function resolveStatusTarget(region: PimRegion, trigger: string): string | undefined {
  const targets = [...new Set(region.transitions
    .filter(t => t.trigger === trigger && t.from !== t.to)
    .map(t => t.to))];
  if (targets.length > 1) {
    console.warn(`  [B15] trigger "${trigger}" leads to several states [${targets.join(", ")}] - using "${targets[0]}"`);
  }
  return targets[0];
}

// B11/B12: one Mendix workflow per orthogonal DEMO region, so the regions stay
// independent (Bzowski 2025, Sec. 11.2.2-11.2.3). ACR_<Entity> starts all of them.
export interface RegionWorkflowPlan {
  workflowName:   string;   // WF_<Entity>_<forEvent>
  waitName:       string;   // WaitForNotification activity
  setMicroflow:   string;   // transition effect, Set<Entity>_<forEvent>
  entryActivity?: string;   // entry activity of the true state, e.g. Create<Child>
}

export function planRegionWorkflows(sm: PimStateMachine): RegionWorkflowPlan[] {
  return sm.regions
    .filter(r => r.forEvent)
    .map(r => ({
      workflowName:  `WF_${sm.entityType}_${r.forEvent}`,
      waitName:      `Wait_${r.forEvent}`,
      setMicroflow:  `Set${sm.entityType}_${r.forEvent}`,
      entryActivity: r.states.find(s => s.kind === "true")?.entryActivity,
    }));
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

  // B1: the model becomes the content of an existing module - delete everything from a previous run.
  const prefix = moduleName + ".";
  [...domainModel.associations].forEach(a => a.delete());
  [...domainModel.entities].forEach(e => e.delete());
  model.allEnumerations().filter(en => (en.qualifiedName ?? "").startsWith(prefix)).forEach(en => en.delete());
  model.allMicroflows().filter(mf => (mf.qualifiedName ?? "").startsWith(prefix)).forEach(mf => mf.delete());
  model.allWorkflows().filter(wf => (wf.qualifiedName ?? "").startsWith(prefix)).forEach(wf => wf.delete());
  model.allPages().filter(p => (p.qualifiedName ?? "").startsWith(prefix) && (p.name ?? "").endsWith("_Overview")).forEach(p => p.delete());
  console.log("[pim-to-mendix] cleared previous model");

  // B4: enumerations -> Mendix enumerations
  const enumMap = new Map<string, enumerations.Enumeration>();
  for (const enumDef of pimModel.enumerations ?? []) {
    const mxEnum = enumerations.Enumeration.createIn(mxModule);
    mxEnum.name  = enumDef.name;
    for (const literal of enumDef.literals) {
      const val  = enumerations.EnumerationValue.createIn(mxEnum);
      val.name   = literal;
      // CW0263 fix: an enumeration value without a caption raises a warning in Studio Pro.
      // Same treatment as the B13 status enums below, so both enumeration paths behave alike.
      const cap  = texts.Text.createInEnumerationValueUnderCaption(val);
      const tr   = texts.Translation.createIn(cap);
      tr.languageCode = "en_US";
      tr.text    = literal.charAt(0).toUpperCase() + literal.slice(1);
    }
    enumMap.set(enumDef.name, mxEnum);
    console.log(`  + enumeration "${enumDef.name}" [${enumDef.literals.join(", ")}]`);
  }

  // B2/B3/B6/B7: classes -> Mendix entities with attributes
  const entityMap    = new Map<string, domainmodels.Entity>();
  const attributeMap = new Map<string, domainmodels.Attribute>(); // key: "EntityName.attrName"
  let x = 0;

  // DataType names (non-categorical domain types) - their attributes become Associations (B5)
  const dataTypeNames = new Set((pimModel.dataTypes ?? []).map(dt => dt.name));
  const deferredDTAssocs: { clsName: string; propName: string; dtName: string }[] = [];

  // B5: non-categorical data types -> Entity in Mendix
  for (const dt of pimModel.dataTypes ?? []) {
    const entity    = domainmodels.Entity.createIn(domainModel);
    entity.name     = dt.name;
    entity.location = { x, y: 400 };
    x += 220;
    entityMap.set(dt.name, entity);
    console.log(`  + data type entity "${dt.name}"`);
  }
  for (const cls of pimModel.classes ?? []) {
    const entity    = domainmodels.Entity.createIn(domainModel);
    entity.name     = cls.name;
    entity.location = { x, y: 0 };
    x += 220;
    entityMap.set(cls.name, entity);

    if (cls.isAbstract) console.log(`  (abstract) "${cls.name}" - Mendix has no abstract entities; marked in pimUML only`);
    if (cls.isDerived)  console.log(`  (derived)  "${cls.name}" - created as regular entity; rule: ${cls.derivationExpression ?? "none"}`);

    for (const prop of cls.ownedAttributes ?? []) {
      if (prop.isDerived) {
        console.log(`  ~ derived attribute "${cls.name}.${prop.name}" not mapped - Mendix has no OCL; rule: ${prop.derivationRule}`);
        continue;
      }
      // B5: non-categorical DataType as attribute type -> deferred Association
      if (prop.type && dataTypeNames.has(prop.type)) {
        deferredDTAssocs.push({ clsName: cls.name, propName: prop.name, dtName: prop.type });
        console.log(`  ~ "${cls.name}.${prop.name}: ${prop.type}" deferred as DataType association (B5)`);
        continue;
      }
      const attr = domainmodels.Attribute.createIn(entity);
      attr.name  = prop.name;
      attr.type  = makeAttributeType(prop.type, model, enumMap);
      attributeMap.set(`${cls.name}.${prop.name}`, attr);
      if (prop.defaultValue !== undefined && attr.value instanceof domainmodels.StoredValue) {
        (attr.value as domainmodels.StoredValue).defaultValue = prop.defaultValue;
      }
      const idMark = prop.isID ? " [logical ID]" : "";
      console.log(`  + attribute ${cls.name}.${prop.name} : ${prop.type ?? "String"}${prop.defaultValue !== undefined ? ` = ${prop.defaultValue}` : ""}${idMark}`);
    }

    console.log(`  + entity "${cls.name}"`);
  }

  // B5: create Associations for DataType-typed attributes (all entities now exist in entityMap)
  for (const dt of deferredDTAssocs) {
    const clsEntity = entityMap.get(dt.clsName);
    const dtEntity  = entityMap.get(dt.dtName);
    if (!clsEntity || !dtEntity) {
      console.warn(`  skipping DataType association "${dt.clsName}.${dt.propName}" - entity not found`);
      continue;
    }
    const mxAssoc  = domainmodels.Association.createIn(domainModel);
    mxAssoc.name   = `${dt.clsName}_${dt.propName}`;
    mxAssoc.parent = clsEntity;  // Mendix SDK: parent = many-side (FK holder, shown as *)
    mxAssoc.child  = dtEntity;   // Mendix SDK: child  = one-side  (referenced, shown as 1)
    mxAssoc.owner  = domainmodels.AssociationOwner.Both;
    console.log(`  + DataType association "${dt.clsName}_${dt.propName}": ${dt.clsName} -> ${dt.dtName}`);
  }

  // B8: association classes -> approximated as Entity + two Associations
  for (const ac of pimModel.associationClasses ?? []) {
    const acEntity    = domainmodels.Entity.createIn(domainModel);
    acEntity.name     = ac.name;
    acEntity.location = { x, y: 200 };
    x += 220;
    entityMap.set(ac.name, acEntity);

    for (const prop of ac.ownedAttributes ?? []) {
      const attr = domainmodels.Attribute.createIn(acEntity);
      attr.name  = prop.name;
      attr.type  = makeAttributeType(prop.type, model, enumMap);
    }

    for (const end of ac.memberEnds) {
      const related = entityMap.get(end.type);
      if (!related) { console.warn(`  skipping association class end "${end.type}" - entity not found`); continue; }
      const mxAssoc  = domainmodels.Association.createIn(domainModel);
      mxAssoc.name   = `${ac.name}_${end.type}`;
      // Mendix SDK: parent = many-side, child = one-side
      // acEntity (e.g. BookingDetail) is the many-side; each related entity can have many AC instances
      mxAssoc.parent = acEntity;
      mxAssoc.child  = related;
    }

    console.log(`  + association class "${ac.name}" [trigger: ${ac.triggerEvent}] approximated as entity + associations (Mendix has no association class concept)`);
  }

  // B10: generalizations -> Mendix entity inheritance
  for (const gen of pimModel.generalizations ?? []) {
    const childEntity  = entityMap.get(gen.child);
    const parentEntity = entityMap.get(gen.parent);
    if (!childEntity || !parentEntity) {
      console.warn(`  skipping generalization "${gen.child} -> ${gen.parent}" - entity not found`);
      continue;
    }
    const mxGen = domainmodels.Generalization.createIn(childEntity);
    mxGen.generalization = parentEntity;
    console.log(`  + generalization "${gen.child}" extends "${gen.parent}"`);
  }

  // B9: associations -> Mendix associations
  const associationMap = new Map<string, domainmodels.Association>();
  for (const assoc of pimModel.associations ?? []) {
    const end0 = assoc.memberEnds[0];
    const end1 = assoc.memberEnds[1];

    // oneEnd = the "1" side, manyEnd = the "*" side
    const [oneEnd, manyEnd] = end0.upper === "*" ? [end1, end0] : [end0, end1];

    const oneEntity  = entityMap.get(oneEnd.type);
    const manyEntity = entityMap.get(manyEnd.type);

    if (!oneEntity || !manyEntity) {
      console.warn(`  skipping association "${assoc.name}" - entity not found`);
      continue;
    }

    const mxAssoc  = domainmodels.Association.createIn(domainModel);
    mxAssoc.name   = assoc.name;
    // Mendix SDK: parent = many-side (FK holder, shown as *), child = one-side (referenced, shown as 1)
    mxAssoc.parent = manyEntity;
    mxAssoc.child  = oneEntity;
    if (assoc.isAggregation || assoc.isDerived || assoc.triggerEvent) {
      mxAssoc.owner = domainmodels.AssociationOwner.Both;
    }
    associationMap.set(assoc.name, mxAssoc);
    const kind = assoc.isDerived ? "derived association" : assoc.triggerEvent ? "event-triggered association" : assoc.isAggregation ? "aggregation" : "association";
    const note = assoc.derivationExpression ? ` [rule: ${assoc.derivationExpression}]` : assoc.triggerEvent ? ` [trigger: ${assoc.triggerEvent}] (state machine behavior NotMapped)` : "";
    console.log(`  + ${kind} "${assoc.name}": ${manyEnd.type}(*) -> ${oneEnd.type}(1)${note}`);
  }

  // B13: for each MERODE sequential FSM, generate <Entity>_Status enum + status attribute
  for (const sm of pimModel.stateMachines ?? []) {
    if (!isMerodeFSM(sm)) continue;
    const entity = entityMap.get(sm.entityType);
    if (!entity) continue;

    const lcStates = sm.regions[0].states.filter(s => s.kind === "simple").map(s => s.name);
    if (lcStates.length === 0) continue;

    const statusEnumName = `${sm.entityType}_Status`;
    const statusEnum = enumerations.Enumeration.createIn(mxModule);
    statusEnum.name  = statusEnumName;
    for (const state of lcStates) {
      const v   = enumerations.EnumerationValue.createIn(statusEnum);
      v.name    = state;
      const cap = texts.Text.createInEnumerationValueUnderCaption(v);
      const tr  = texts.Translation.createIn(cap);
      tr.languageCode = "en_US";
      tr.text   = state.charAt(0).toUpperCase() + state.slice(1);
    }
    enumMap.set(statusEnumName, statusEnum);

    const statusAttr = domainmodels.Attribute.createIn(entity);
    statusAttr.name  = "status";
    const enumAttrType = domainmodels.EnumerationAttributeType.create(model);
    enumAttrType.enumeration = statusEnum;
    statusAttr.type  = enumAttrType;
    attributeMap.set(`${sm.entityType}.status`, statusAttr);

    console.log(`  + ${statusEnumName} [${lcStates.join(", ")}] + status attribute on ${sm.entityType}`);
  }

  // activity microflows - one per state machine activity
  const microflowMap = new Map<string, microflows.Microflow>();
  for (const sm of pimModel.stateMachines ?? []) {
    for (const activity of sm.activities ?? []) {
      const mf  = microflows.Microflow.createIn(mxModule);
      mf.name   = activity.name;
      microflowMap.set(activity.name, mf);

      const objCol = mf.objectCollection;
      const start  = microflows.StartEvent.createIn(objCol);
      const end    = microflows.EndEvent.createIn(objCol);

      start.relativeMiddlePoint = { x: 0,   y: 0 };
      end.relativeMiddlePoint   = { x: 200, y: 0 };

      // B14: MERODE create - entity creates itself, sets initial lifecycle status
      if (activity.kind === "create" && activity.targetType && isMerodeFSM(sm)
          && activity.targetType === sm.entityType) {
        const entityName   = activity.targetType;
        const targetEntity = entityMap.get(entityName);
        if (targetEntity) {
          const varName    = entityName.charAt(0).toLowerCase() + entityName.slice(1);
          const createAct  = microflows.ActionActivity.createIn(objCol);
          createAct.relativeMiddlePoint = { x: 100, y: 0 };
          const createObj  = microflows.CreateObjectAction.createIn(createAct);
          createObj.entity = targetEntity;
          createObj.outputVariableName = varName;
          createObj.commit = microflows.CommitEnum.Yes;

          const statusAttr  = attributeMap.get(`${entityName}.status`);
          const firstState  = sm.regions[0]?.states.find(s => s.kind === "simple")?.name;
          if (statusAttr && firstState) {
            const mc      = microflows.MemberChange.createIn(createObj);
            mc.attribute  = statusAttr;
            mc.value      = `${moduleName}.${entityName}_Status.${firstState}`;
          }

          end.relativeMiddlePoint = { x: 280, y: 0 };
          const f1 = microflows.SequenceFlow.createIn(mf); f1.origin = start;     f1.destination = createAct;
          const f2 = microflows.SequenceFlow.createIn(mf); f2.origin = createAct; f2.destination = end;
          console.log(`  + microflow "${activity.name}" [MERODE: create ${entityName}, status=${firstState ?? "?"}]`);
          continue;
        }
      }

      // B12 (Bzowski B16, B18-B21): DEMO create - child entity created and linked to parent
      if (activity.kind === "create" && activity.targetType) {
        const childName    = activity.targetType;
        const parentName   = sm.entityType;
        const childEntity  = entityMap.get(childName);
        const parentEntity = entityMap.get(parentName);

        // find the pimUML association linking child to parent
        const pimAssoc = pimModel.associations?.find(a => {
          const t0 = a.memberEnds[0].type;
          const t1 = a.memberEnds[1].type;
          return (t0 === childName && t1 === parentName) || (t1 === childName && t0 === parentName);
        });
        const mxAssoc       = pimAssoc ? associationMap.get(pimAssoc.name) : undefined;
        const childIDAttr   = attributeMap.get(`${childName}.${childName}ID`);

        const parentVar = parentName.charAt(0).toLowerCase() + parentName.slice(1);
        const childVar  = childName.charAt(0).toLowerCase() + childName.slice(1);

        if (childEntity && parentEntity) {
          // parameter - parent entity object (Bzowski B16)
          const mfParam = microflows.MicroflowParameterObject.createIn(objCol);
          mfParam.name  = parentVar;
          mfParam.relativeMiddlePoint = { x: -80, y: 0 };
          const paramType = datatypes.ObjectType.create(model);
          paramType.entity = parentEntity;
          mfParam.variableType = paramType;

          // CreateObjectAction - instantiate child (Bzowski B20); B18+B19 inlined as MemberChanges
          // (CreateVariableAction skipped: SDK cannot set variable type -> defaults to Boolean.
          //  Expressions are inlined directly to avoid CE0117.)
          const createAct = microflows.ActionActivity.createIn(objCol);
          createAct.relativeMiddlePoint = { x: 100, y: 0 };
          const createObj = microflows.CreateObjectAction.createIn(createAct);
          createObj.entity = childEntity;
          createObj.outputVariableName = childVar;
          createObj.commit = microflows.CommitEnum.Yes;

          // copy parent's logical ID into child's ID attribute (Bzowski B18, B21 as expression)
          if (childIDAttr) {
            const mc1 = microflows.MemberChange.createIn(createObj);
            mc1.attribute = childIDAttr;
            mc1.value = `$${parentVar}/${parentName}ID`;
          }

          // set association link to parent (Bzowski B19)
          if (mxAssoc) {
            const mc2 = microflows.MemberChange.createIn(createObj);
            mc2.association = mxAssoc;
            mc2.value = `$${parentVar}`;
          }

          end.relativeMiddlePoint = { x: 280, y: 0 };

          const f1 = microflows.SequenceFlow.createIn(mf); f1.origin = start;    f1.destination = createAct;
          const f2 = microflows.SequenceFlow.createIn(mf); f2.origin = createAct; f2.destination = end;

          console.log(`  + microflow "${activity.name}" [create ${childName} from ${parentName}]${!mxAssoc ? " [warn] no association found" : ""}`);
          continue;
        }
      }

      // B12 (Bzowski B16-B18): DEMO set - MicroflowParameterObject + ChangeObjectAction (sets boolean event attribute)
      // CE0049 caveat: logical MicroflowParameter cannot be created via SDK (same limitation as ACR).
      // The MicroflowParameterObject makes the variable visible in Studio Pro; one OK-click fixes CE0049.
      if (activity.kind === "set" && activity.targetType) {
        const setEntityName  = activity.targetType;
        const eventName      = activity.name.substring((`Set${setEntityName}_`).length);
        const targetEntity   = entityMap.get(setEntityName);
        const boolAttr       = attributeMap.get(`${setEntityName}.${eventName}`);

        if (targetEntity && boolAttr) {
          const setVarName = setEntityName.charAt(0).toLowerCase() + setEntityName.slice(1);

          const setParam   = microflows.MicroflowParameterObject.createIn(objCol);
          setParam.name    = setVarName;
          setParam.relativeMiddlePoint = { x: -80, y: 0 };
          const setObjType = datatypes.ObjectType.create(model);
          setObjType.entity = targetEntity;
          setParam.variableType = setObjType;

          const actionAct  = microflows.ActionActivity.createIn(objCol);
          actionAct.relativeMiddlePoint = { x: 100, y: 0 };
          end.relativeMiddlePoint = { x: 260, y: 0 };

          const changeAct  = microflows.ChangeObjectAction.createIn(actionAct);
          changeAct.changeVariableName = setVarName;
          changeAct.commit = microflows.CommitEnum.Yes;

          const memberChange = microflows.MemberChange.createIn(changeAct);
          memberChange.attribute = boolAttr;
          memberChange.value = "true";

          const flow1       = microflows.SequenceFlow.createIn(mf);
          flow1.origin      = start;
          flow1.destination = actionAct;
          const flow2       = microflows.SequenceFlow.createIn(mf);
          flow2.origin      = actionAct;
          flow2.destination = end;

          console.log(`  + microflow "${activity.name}" [set ${setEntityName}.${eventName} = true] [warn] CE0049: click OK once in Studio Pro`);
          continue;
        }
      }

      // B15: MERODE set - change status to transition target (unless all transitions are
      // self-transitions) + set any explicitly declared effects
      if (activity.kind === "set" && activity.targetType && isMerodeFSM(sm)) {
        const entityName   = activity.targetType;
        const eventName    = activity.name.substring(`Set_${entityName}_`.length);
        const targetEntity = entityMap.get(entityName);
        const region       = sm.regions[0];
        const hasTrigger   = region.transitions.some(t => t.trigger === eventName);
        const toState      = resolveStatusTarget(region, eventName);
        const statusAttr   = attributeMap.get(`${entityName}.status`);
        if (targetEntity && hasTrigger && statusAttr) {
          const varName  = entityName.charAt(0).toLowerCase() + entityName.slice(1);
          const effects  = activity.effects ?? [];

          // entity parameter
          const setParam   = microflows.MicroflowParameterObject.createIn(objCol);
          setParam.name    = varName;
          setParam.relativeMiddlePoint = { x: -80, y: 0 };
          const setObjType = datatypes.ObjectType.create(model);
          setObjType.entity = targetEntity;
          setParam.variableType = setObjType;

          // one parameter per effect attribute (stacked vertically)
          effects.forEach((ef, idx) => {
            const paramName = `new${ef.attribute.charAt(0).toUpperCase()}${ef.attribute.slice(1)}`;
            const efParam   = microflows.MicroflowParameterObject.createIn(objCol);
            efParam.name    = paramName;
            efParam.relativeMiddlePoint = { x: -80, y: 50 * (idx + 1) };
            efParam.variableType = makeParameterType(ef.type, model, enumMap);
          });

          const actionAct  = microflows.ActionActivity.createIn(objCol);
          actionAct.relativeMiddlePoint = { x: 100, y: 0 };
          end.relativeMiddlePoint = { x: 260, y: 0 };
          const changeAct  = microflows.ChangeObjectAction.createIn(actionAct);
          changeAct.changeVariableName = varName;
          changeAct.commit = microflows.CommitEnum.Yes;

          // status change (omitted for self-transitions, the object keeps its current state)
          if (toState) {
            const mcStatus   = microflows.MemberChange.createIn(changeAct);
            mcStatus.attribute = statusAttr;
            mcStatus.value   = `${moduleName}.${entityName}_Status.${toState}`;
          }

          // attribute changes from explicit effects
          effects.forEach(ef => {
            const efAttr = attributeMap.get(`${entityName}.${ef.attribute}`);
            if (!efAttr) { console.warn(`  [B15] effect attribute "${entityName}.${ef.attribute}" not found in attributeMap`); return; }
            const paramName = `new${ef.attribute.charAt(0).toUpperCase()}${ef.attribute.slice(1)}`;
            const mcEf      = microflows.MemberChange.createIn(changeAct);
            mcEf.attribute  = efAttr;
            mcEf.value      = `$${paramName}`;
          });

          const f1 = microflows.SequenceFlow.createIn(mf); f1.origin = start;     f1.destination = actionAct;
          const f2 = microflows.SequenceFlow.createIn(mf); f2.origin = actionAct; f2.destination = end;
          const effectsLog = effects.length > 0 ? ` + [${effects.map(e => e.attribute).join(", ")}]` : "";
          const statusLog  = toState ? `${entityName}.status = ${toState}` : `${entityName}.status unchanged`;
          console.log(`  + microflow "${activity.name}" [MERODE: set ${statusLog}${effectsLog}]`);
          continue;
        }
      }

      // B16: MERODE end - delete the entity object (M8, hard delete per DD12)
      if (activity.kind === "end" && activity.targetType) {
        const entityName   = activity.targetType;
        const targetEntity = entityMap.get(entityName);
        if (targetEntity) {
          const varName    = entityName.charAt(0).toLowerCase() + entityName.slice(1);

          const endParam   = microflows.MicroflowParameterObject.createIn(objCol);
          endParam.name    = varName;
          endParam.relativeMiddlePoint = { x: -80, y: 0 };
          const endObjType = datatypes.ObjectType.create(model);
          endObjType.entity = targetEntity;
          endParam.variableType = endObjType;

          const deleteAct  = microflows.ActionActivity.createIn(objCol);
          deleteAct.relativeMiddlePoint = { x: 100, y: 0 };
          const deleteObj  = microflows.DeleteAction.createIn(deleteAct);
          deleteObj.deleteVariableName = varName;

          end.relativeMiddlePoint = { x: 280, y: 0 };
          const f1 = microflows.SequenceFlow.createIn(mf); f1.origin = start;     f1.destination = deleteAct;
          const f2 = microflows.SequenceFlow.createIn(mf); f2.origin = deleteAct; f2.destination = end;
          console.log(`  + microflow "${activity.name}" [MERODE: delete ${entityName}]`);
          continue;
        }
      }

      const flow         = microflows.SequenceFlow.createIn(mf);
      flow.origin        = start;
      flow.destination   = end;

      console.log(`  + microflow "${activity.name}" [${activity.kind}]`);
    }
  }

  // B11/B12 (Bzowski B11, B12, B23, B24): per DEMO state machine - one Workflow per region + ACR Microflow
  // that starts all of them (MERODE FSMs are handled by B13-B16)
  for (const sm of pimModel.stateMachines ?? []) {
    if (sm.regions.length === 0) continue;
    if (isMerodeFSM(sm)) continue;
    const entityName = sm.entityType;
    const entity     = entityMap.get(entityName);
    if (!entity) continue;

    const entityVarName = entityName.charAt(0).toLowerCase() + entityName.slice(1);
    const regionWorkflows: workflows.Workflow[] = [];

    // B12: one Workflow document per region, so orthogonal regions progress independently
    for (const plan of planRegionWorkflows(sm)) {
      const wf    = workflows.Workflow.createIn(mxModule);
      wf.name     = plan.workflowName;
      wf.title    = plan.workflowName.replace(/_/g, " ");

      // CE1850 fix: workflow context parameter (required)
      const wfParam    = workflows.Parameter.createIn(wf);
      wfParam.name     = "WorkflowContext";
      wfParam.entity   = entity;

      const wfMeta = workflows.WorkflowMetaData.createIn(wf);
      const flow   = workflows.Flow.createInWorkflowUnderFlow(wf);

      // CE7247 fix: activities need both name and caption
      const startAct   = workflows.StartWorkflowActivity.createInFlowUnderActivities(flow);
      startAct.name    = "Start";
      startAct.caption = "Start";
      let prevAct: workflows.WorkflowActivity = startAct;

      // trigger -> WaitForNotification (Bzowski B23)
      const waitAct    = workflows.WaitForNotificationActivity.createInFlowUnderActivities(flow);
      waitAct.name     = plan.waitName;
      waitAct.caption  = plan.waitName.replace("_", ": ");
      const waitLine   = workflows.FlowLine.createIn(wfMeta);
      waitLine.origin      = prevAct;
      waitLine.destination = waitAct;
      prevAct = waitAct;

      // transition effect -> CallMicroflowTask(Set) (Bzowski B23), entry activity -> CallMicroflowTask(Create) (Bzowski B24)
      for (const mfName of [plan.setMicroflow, plan.entryActivity]) {
        const mf = mfName ? microflowMap.get(mfName) : undefined;
        if (!mfName || !mf) continue;
        const callTask     = workflows.CallMicroflowTask.createInFlowUnderActivities(flow);
        callTask.name      = `Call_${mfName}`;
        callTask.caption   = `Call: ${mfName}`;
        callTask.microflow = mf;
        // CE6686 fix: add VoidConditionOutcome so outcomes match
        workflows.VoidConditionOutcome.createIn(callTask);
        // Parameter mapping: $WorkflowContext -> microflow's entity parameter (CE6685 fix attempt)
        // MicroflowParameter is not directly creatable via SDK; we set the reference by qualified name.
        // Works if the server auto-creates MicroflowParameter from MicroflowParameterObject on flush.
        const mapping = workflows.MicroflowCallParameterMapping.create(model);
        mapping.expression = `$WorkflowContext`;
        try { (mapping as any).__parameter.updateWithRawValue(`${moduleName}.${mfName}.${entityVarName}`); } catch (_) {}
        callTask.parameterMappings.push(mapping);
        const callLine       = workflows.FlowLine.createIn(wfMeta);
        callLine.origin      = prevAct;
        callLine.destination = callTask;
        prevAct = callTask;
      }

      const endAct    = workflows.EndWorkflowActivity.createInFlowUnderActivities(flow);
      endAct.name     = "End";
      endAct.caption  = "End";
      const endLine   = workflows.FlowLine.createIn(wfMeta);
      endLine.origin      = prevAct;
      endLine.destination = endAct;

      regionWorkflows.push(wf);
      console.log(`  + workflow "${plan.workflowName}"`);
    }
    if (regionWorkflows.length === 0) continue;

    // B11: ACR Microflow that starts one Workflow per region
    //
    // KNOWN LIMITATION (CE0049 - "No variable name specified"):
    // The Mendix SDK does not expose MicroflowParameter (the logical scope variable
    // that the CE checker requires for WorkflowCallAction.workflowContextVariable).
    // MicroflowParameterObject (the visual canvas element) is created and populated
    // correctly so the Studio Pro dropdown works, but the CE0049 error persists until
    // the user opens each WorkflowCallAction dialog in Studio Pro and clicks OK once.
    // All SDK-level workarounds attempted (CREATE_ELEMENT_TREE delta injection,
    // CREATE_UNIT_TREE interception, hasVariableNameBeenChanged flag) were rejected
    // or silently ignored by the Mendix model server.
    const acrMf  = microflows.Microflow.createIn(mxModule);
    acrMf.name   = `ACR_${entityName}`;

    const acrObjCol  = acrMf.objectCollection;
    const acrStart   = microflows.StartEvent.createIn(acrObjCol);
    acrStart.relativeMiddlePoint = { x: 0, y: 0 };

    // MicroflowParameterObject: visual canvas element - populates the Object dropdown
    // in the WorkflowCallAction dialog so the user can confirm the selection manually.
    const acrParam   = microflows.MicroflowParameterObject.createIn(acrObjCol);
    acrParam.name    = entityVarName;
    acrParam.relativeMiddlePoint = { x: -80, y: 0 };
    const objType    = datatypes.ObjectType.create(model);
    objType.entity   = entity;
    acrParam.variableType = objType;

    // Commit first: Mendix only starts workflows for committed objects, but an
    // After Create handler runs before the first commit (DD13)
    const acrCommitAct = microflows.ActionActivity.createIn(acrObjCol);
    acrCommitAct.relativeMiddlePoint = { x: 150, y: 0 };
    const commitAct = microflows.CommitAction.createIn(acrCommitAct);
    commitAct.commitVariableName = entityVarName;
    commitAct.withEvents         = true;
    commitAct.refreshInClient    = true;
    const acrFlowCommit       = microflows.SequenceFlow.createIn(acrMf);
    acrFlowCommit.origin      = acrStart;
    acrFlowCommit.destination = acrCommitAct;

    let acrPrev: microflows.MicroflowObject = acrCommitAct;
    regionWorkflows.forEach((wf, i) => {
      const acrActionAct = microflows.ActionActivity.createIn(acrObjCol);
      acrActionAct.relativeMiddlePoint = { x: 150 * (i + 2), y: 0 };
      const wfCallAct = microflows.WorkflowCallAction.createIn(acrActionAct);
      wfCallAct.workflow                = wf;
      wfCallAct.workflowContextVariable = entityVarName;
      wfCallAct.useReturnVariable       = false;
      const acrFlow       = microflows.SequenceFlow.createIn(acrMf);
      acrFlow.origin      = acrPrev;
      acrFlow.destination = acrActionAct;
      acrPrev = acrActionAct;
    });

    const acrEnd = microflows.EndEvent.createIn(acrObjCol);
    acrEnd.relativeMiddlePoint = { x: 150 * (regionWorkflows.length + 2), y: 0 };
    const acrFlowEnd       = microflows.SequenceFlow.createIn(acrMf);
    acrFlowEnd.origin      = acrPrev;
    acrFlowEnd.destination = acrEnd;

    // B11: register ACR as After Create event handler, so the state machine starts
    // when the object is instantiated (Bzowski 2025, Sec. 11.2.3)
    const acrHandler = domainmodels.EventHandler.createIn(entity);
    acrHandler.moment            = domainmodels.ActionMoment.After;
    acrHandler.event             = domainmodels.EventType.Create;
    acrHandler.microflow         = acrMf;
    acrHandler.passEventObject   = true;
    acrHandler.raiseErrorOnFalse = false;

    microflowMap.set(`ACR_${entityName}`, acrMf);
    console.log(`  + ACR microflow "ACR_${entityName}" [after create] -> commit + ${regionWorkflows.length} workflow(s) WF_${entityName}_*`);
  }

  // -- Pages + Navigation --------------------------------------------------------
  // Find a web layout by borrowing the reference from any existing page outside
  // our module. A blank Mendix starter app always has at least one pre-built page
  // that already has a valid Atlas layout wired up.
  let webLayout: pages.ILayout | null = null;
  let contentParam: pages.ILayoutParameter | null = null;
  let borrowedParamQN: string | null = null; // raw qualified name for Atlas UI 3.x bypass

  // Deep-search helper: traverses all known Mendix widget container types recursively.
  // Atlas layouts often nest LayoutParameters inside ScrollContainer regions rather
  // than top-level widget lists, so a shallow .widgets check is not enough.
  // Safely read a property - returns undefined if the SDK throws (deleted property).
  const safeGet = (obj: any, key: string): any => {
    try { return obj[key]; } catch { return undefined; }
  };

  const findLayoutParam = (obj: any, depth = 0): pages.ILayoutParameter | null => {
    if (!obj || typeof obj !== "object" || depth > 20) return null;
    if (obj.structureTypeName === "Pages$LayoutParameter") return obj as pages.ILayoutParameter;

    // List properties: widgets, rows, columns, tabPages - try-catch only around property read
    for (const listKey of ["widgets", "rows", "columns", "tabPages", "items"]) {
      const list = safeGet(obj, listKey);
      if (!list) continue;
      for (const item of list) {
        const found = findLayoutParam(item, depth + 1);   // errors propagate correctly
        if (found) return found;
      }
    }
    // ScrollContainer regions - each region's .widgets is then iterated recursively
    for (const regionKey of ["center", "top", "bottom", "left", "right",
                              "topRegion", "centerRegion", "bottomRegion",
                              "leftRegion", "rightRegion",
                              "firstRegion", "secondRegion"]) {
      const region = safeGet(obj, regionKey);
      if (!region || typeof region !== "object") continue;
      const found = findLayoutParam(region, depth + 1);
      if (found) return found;
    }
    // Single-child references (skip "widget" singular - deleted since Mendix 7.15)
    for (const childKey of ["leftWidget", "rightWidget", "headerWidget", "footerWidget", "content"]) {
      const child = safeGet(obj, childKey);
      if (!child || typeof child !== "object") continue;
      const found = findLayoutParam(child, depth + 1);
      if (found) return found;
    }
    return null;
  };

  // Strategy 1: borrow layout + LayoutParameter from an existing non-module page.
  // In Mendix 11 Atlas UI 3.x the resolved parameter object is often null while
  // parameterQualifiedName (the raw string) is still set - check both.
  for (const pg of model.allPages()) {
    if ((pg.qualifiedName ?? "").startsWith(prefix)) continue;
    const fp  = await pg.load();
    const args = fp.layoutCall?.arguments;
    if (!args?.length) {
      if (!webLayout && fp.layoutCall?.layout) webLayout = fp.layoutCall.layout;
      continue;
    }
    const arg = args[0];
    const pqn = (arg as any).parameterQualifiedName as string | undefined;
    console.log(`[pim-to-mendix] page "${pg.qualifiedName}": layout="${fp.layoutCall?.layout?.qualifiedName ?? "?"}", args=${args.length}, paramQN="${pqn ?? "null"}"`);

    if (arg.parameter) {
      webLayout    = fp.layoutCall!.layout;
      contentParam = arg.parameter;
      console.log(`[pim-to-mendix] layout parameter borrowed (resolved) from "${pg.qualifiedName}"`);
      break;
    }
    if (pqn) {
      const layoutQN = fp.layoutCall?.layout?.qualifiedName ?? "";
      const isNonPopup = !layoutQN.toLowerCase().includes("popup");
      if (!webLayout && isNonPopup) webLayout = fp.layoutCall!.layout;
      const found = model.findLayoutParameterByQualifiedName(pqn);
      if (found) {
        if (!contentParam) contentParam = found;
        console.log(`[pim-to-mendix] layout parameter resolved via paramQN "${pqn}"`);
        break;
      }
      // LayoutParameter object not in model index, but the qualified name string is valid.
      // Save it for direct SDK bypass (updateWithRawValue) during page creation.
      if (!borrowedParamQN && isNonPopup) {
        borrowedParamQN = pqn;
        console.log(`[pim-to-mendix] will use SDK bypass: paramQN="${pqn}" from "${pg.qualifiedName}"`);
        break; // layout and paramQN are enough - stop scanning pages
      }
    }
    if (!webLayout && fp.layoutCall?.layout) webLayout = fp.layoutCall.layout;
  }

  // Strategy 2: fall back to any non-popup, non-native layout
  if (!webLayout) {
    webLayout = model.allLayouts().find(l => {
      const n = (l.qualifiedName ?? "").toLowerCase();
      return !n.includes("popup") && !n.includes("native") && !n.includes("login");
    }) ?? null;
  }

  // Strategy 3: load layouts and search for LayoutParameter via widget-tree traversal
  // and findLayoutParameterByQualifiedName. In Mendix 11 Atlas UI 3.x, the "Main"
  // LayoutParameter in Atlas_Core is NOT indexed in the SDK working-copy model (it
  // lives in a protected module), so this strategy will find nothing. We proceed
  // without a contentParam and rely on the LCA still being serialized correctly.
  if (!contentParam && !borrowedParamQN) {
    const candidates = model.allLayouts().filter(l => {
      const n = (l.qualifiedName ?? "").toLowerCase();
      return !n.includes("popup") && !n.includes("native") && !n.includes("login");
    });

    for (const layout of candidates) {
      const loaded = await layout.load();
      const wlc    = (loaded as pages.Layout).content as pages.WebLayoutContent | null;
      if (!wlc) continue;

      const found = findLayoutParam(wlc);
      if (found) {
        webLayout    = layout;
        contentParam = found;
        console.log(`[pim-to-mendix] layout parameter found via deep-traversal in "${layout.qualifiedName}"`);
        break;
      }

      const lqn = loaded.qualifiedName ?? "";
      for (const name of ["Main", "Content", "Page", "Body", "Center"]) {
        const byName = model.findLayoutParameterByQualifiedName(`${lqn}.${name}`);
        if (byName) {
          webLayout    = layout;
          contentParam = byName;
          console.log(`[pim-to-mendix] layout parameter found by name "${lqn}.${name}"`);
          break;
        }
      }
      if (contentParam) break;
    }

    if (!contentParam) {
      console.warn(`[pim-to-mendix] SDK limitation: LayoutParameter "Main" in Atlas_Core is not accessible - pages generated without resolved parameter reference`);
    }
  }


  if (!webLayout) {
    console.warn("[pim-to-mendix] no suitable layout found - skipping page generation");
  } else {
    const pageMap = new Map<string, pages.Page>();

    for (const cls of pimModel.classes ?? []) {
      const entity = entityMap.get(cls.name);
      if (!entity) continue;

      const page = pages.Page.createIn(mxModule);
      page.name  = `${cls.name}_Overview`;

      // Page title
      {
        const t  = texts.Text.createInPageUnderTitle(page);
        const tr = texts.Translation.createIn(t);
        tr.languageCode = "en_US";
        tr.text = `${cls.name} Overview`;
      }

      // Layout - always create a LayoutCallArgument.
      // In Mendix 11 Atlas UI 3.x, the layout parameter reference may be null;
      // the runtime still renders arg.widgets in the default content slot.
      const lc  = page.layoutCall;
      lc.layout = webLayout;
      const lca = pages.LayoutCallArgument.createIn(lc);
      if (contentParam) lca.parameter = contentParam;
      // Atlas UI 3.x SDK limitation: LayoutParameter "Main" in Atlas_Core is not indexed
      // in the working-copy model, so lca.parameter cannot be set the normal way.
      // updateWithRawValue sets the qualified-name string directly on the internal
      // ByNameReferenceProperty, triggering the correct change delta so the server
      // stores the reference and Studio Pro resolves it on next open.
      if (borrowedParamQN) {
        (lca as any).__parameter.updateWithRawValue(borrowedParamQN);
      }

      // The generated ACR_<Entity> microflow and WF_<Entity>_<event> workflows remain in the module.
      const hasSM = pimModel.stateMachines?.some(sm => sm.entityType === cls.name && sm.regions.length > 0) ?? false;
      if (hasSM) {
        console.log(`    [info] ACR_${cls.name} (after create) + WF_${cls.name}_* generated - workflows start when a ${cls.name} is created`);
      }

      pageMap.set(cls.name, page);
      console.log(`  + page "${page.name}"`);
    }

    // Navigation: add one menu item per entity page in the responsive profile
    const navDocs = model.allNavigationDocuments();
    if (navDocs.length > 0) {
      const navDoc  = await navDocs[0].load();
      const profile = navDoc.profiles.find(p =>
        (p as navigation.NavigationProfile).kind === navigation.ProfileKind.Responsive
      ) as navigation.NavigationProfile | undefined ?? navDoc.profiles[0] as navigation.NavigationProfile | undefined;

      if (profile?.menuItemCollection) {
        // Remove old items that point to pages in our module
        [...profile.menuItemCollection.items].forEach(mi => {
          const item = mi as menus.MenuItem;
          if (!item.action) return;
          const pca = item.action as pages.PageClientAction;
          if (!pca.pageSettings) return;
          if ((pca.pageSettings.pageQualifiedName ?? "").startsWith(prefix)) item.delete();
        });

        for (const [entityName, page] of pageMap) {
          const mi  = menus.MenuItem.createIn(profile.menuItemCollection);
          const t   = texts.Text.createInMenuItemUnderCaption(mi);
          const tr  = texts.Translation.createIn(t);
          tr.languageCode = "en_US";
          tr.text = entityName;
          const pca = pages.PageClientAction.createInMenuItemUnderAction(mi);
          const ps  = pages.PageSettings.createInPageClientActionUnderPageSettings(pca);
          ps.page   = page;
        }

        // Fix CE1613: point the profile's home page to our first generated entity page
        // so that the app has a valid landing page when opened via Studio Pro Play.
        const firstPage = [...pageMap.values()][0];
        if (firstPage && profile.homePage) {
          profile.homePage.page = firstPage;
        }

        console.log(`  + navigation: ${pageMap.size} menu item(s) added`);
      }
    }
  }

  await model.flushChanges();
}

async function main() {
  console.log("[pim-to-mendix] starting");
  console.log(`[pim-to-mendix] target: app="${mendixConfig.appId || "(not set)"}", module="${mendixConfig.moduleName}", branch="${mendixConfig.branch}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[pim-to-mendix] connected to ${config.broker}:${config.port}`);

  const onPimReceived = async (rawModel: PimModel, timestamp: string) => {
    console.log(`[pim-to-mendix] received model at ${timestamp}`);

    const { clean: pim, meta } = extractMeta(rawModel);

    if (meta._trace && meta._trace.length > 0) {
      console.log(`[pim-to-mendix] trace (${meta._trace.length} entries):`);
      for (const entry of meta._trace) {
        console.log(`  ${entry.sourceType} "${entry.sourceName}" -> ${entry.targetType} "${entry.targetName}"`);
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
      console.warn("[pim-to-mendix] no appId - skipping");
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[pim-to-mendix] commit failed:", msg, err);
    }
  };

  for (const agentId of PIM_SOURCE_AGENTS) {
    bus.subscribePimState(agentId, IN_ARTEFACT, onPimReceived);
    console.log(`[pim-to-mendix] subscribed to PIM from "${agentId}"`);
  }

  console.log("[pim-to-mendix] listening ... (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[pim-to-mendix] unhandled error:", err);
    process.exit(1);
  });
}
