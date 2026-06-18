// pim-to-mendix-agent
// Listens on the bus for pimUML models and writes them into a Mendix app via the Platform SDK.

import { IModel, domainmodels, enumerations, microflows, datatypes, workflows } from "mendixmodelsdk";
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
  model.allMicroflows().filter(mf => (mf.qualifiedName ?? "").startsWith(prefix)).forEach(mf => mf.delete());
  model.allWorkflows().filter(wf => (wf.qualifiedName ?? "").startsWith(prefix)).forEach(wf => wf.delete());
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
  const entityMap    = new Map<string, domainmodels.Entity>();
  const attributeMap = new Map<string, domainmodels.Attribute>(); // key: "EntityName.attrName"
  let x = 0;

  // non-categorical data types → Entity in Mendix (B4)
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

    if (cls.isAbstract) console.log(`  (abstract) "${cls.name}" — Mendix has no abstract entities; marked in pimUML only`);
    if (cls.isDerived)  console.log(`  (derived)  "${cls.name}" — created as regular entity; rule: ${cls.derivationExpression ?? "none"}`);

    for (const prop of cls.ownedAttributes ?? []) {
      if (prop.isDerived) {
        console.log(`  ~ derived attribute "${cls.name}.${prop.name}" not mapped — Mendix has no OCL; rule: ${prop.derivationRule}`);
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

  // association classes → approximated as Entity + two Associations (A8)
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
      if (!related) { console.warn(`  skipping association class end "${end.type}" — entity not found`); continue; }
      const mxAssoc  = domainmodels.Association.createIn(domainModel);
      mxAssoc.name   = `${ac.name}_${end.type}`;
      mxAssoc.parent = related;
      mxAssoc.child  = acEntity;
    }

    console.log(`  + association class "${ac.name}" [trigger: ${ac.triggerEvent}] approximated as entity + associations (Mendix has no association class concept)`);
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
    if (assoc.isAggregation) {
      mxAssoc.owner = domainmodels.AssociationOwner.Both;
    }
    const kind = assoc.isDerived ? "derived association" : assoc.triggerEvent ? "event-triggered association" : assoc.isAggregation ? "aggregation" : "association";
    const note = assoc.derivationExpression ? ` [rule: ${assoc.derivationExpression}]` : assoc.triggerEvent ? ` [trigger: ${assoc.triggerEvent}] (state machine behavior NotMapped)` : "";
    console.log(`  + ${kind} "${assoc.name}": ${parentEnd.type} → ${childEnd.type}${note}`);
  }

  // activity microflows — one per state machine activity (B13/B14/B15/B22)
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

      // B20: create-kind → CreateObjectAction between start and end
      if (activity.kind === "create" && activity.targetType) {
        const targetEntity = entityMap.get(activity.targetType);
        if (targetEntity) {
          const actionAct  = microflows.ActionActivity.createIn(objCol);
          actionAct.relativeMiddlePoint = { x: 100, y: 0 };

          const createAct  = microflows.CreateObjectAction.createIn(actionAct);
          createAct.entity = targetEntity;
          createAct.outputVariableName = activity.targetType.charAt(0).toLowerCase() + activity.targetType.slice(1);

          const flow1        = microflows.SequenceFlow.createIn(mf);
          flow1.origin       = start;
          flow1.destination  = actionAct;
          const flow2        = microflows.SequenceFlow.createIn(mf);
          flow2.origin       = actionAct;
          flow2.destination  = end;

          console.log(`  + microflow "${activity.name}" [create → ${activity.targetType}]`);
          continue;
        }
      }

      // B16/B17/B18: set-kind → parameter + ChangeObjectAction setting boolean to true
      if (activity.kind === "set" && activity.targetType) {
        const entityName = activity.targetType;
        const eventName  = activity.name.substring((`Set${entityName}_`).length);
        const entity     = entityMap.get(entityName);
        const boolAttr   = attributeMap.get(`${entityName}.${eventName}`);

        if (entity && boolAttr) {
          const varName = entityName.charAt(0).toLowerCase() + entityName.slice(1);

          // B16: parameter object (visual input variable)
          const paramObj = microflows.MicroflowParameterObject.createIn(objCol);
          paramObj.name  = varName;
          paramObj.relativeMiddlePoint = { x: -80, y: 0 };
          const objType  = datatypes.ObjectType.create(model);
          objType.entity = entity;
          paramObj.variableType = objType;

          // B17/B18: ChangeObjectAction setting the boolean attribute to true
          const actionAct  = microflows.ActionActivity.createIn(objCol);
          actionAct.relativeMiddlePoint = { x: 100, y: 0 };
          const changeAct  = microflows.ChangeObjectAction.createIn(actionAct);
          changeAct.changeVariableName = varName;

          const memberChange      = microflows.MemberChange.createIn(changeAct);
          memberChange.attribute  = boolAttr;
          memberChange.value      = "true";
          memberChange.type       = microflows.ChangeActionItemType.Set;

          const flow1       = microflows.SequenceFlow.createIn(mf);
          flow1.origin      = start;
          flow1.destination = actionAct;
          const flow2       = microflows.SequenceFlow.createIn(mf);
          flow2.origin      = actionAct;
          flow2.destination = end;

          console.log(`  + microflow "${activity.name}" [set ${entityName}.${eventName} = true]`);
          continue;
        }
      }

      const flow         = microflows.SequenceFlow.createIn(mf);
      flow.origin        = start;
      flow.destination   = end;

      console.log(`  + microflow "${activity.name}" [${activity.kind}]`);
    }
  }

  // B11/B12/B23/B24: per entity type — Workflow + ACR Microflow
  for (const sm of pimModel.stateMachines ?? []) {
    if (sm.regions.length === 0) continue;
    const entityName = sm.entityType;
    const entity     = entityMap.get(entityName);
    if (!entity) continue;

    const varName = entityName.charAt(0).toLowerCase() + entityName.slice(1);

    // B12: Workflow document with one flow per entity type
    const wf    = workflows.Workflow.createIn(mxModule);
    wf.name     = `WF_${entityName}`;
    wf.title    = `WF ${entityName}`;

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

    // B23/B24: one WaitForNotification + CallMicroflowTask(Set) per region, plus CallMicroflowTask(Create) for entry activities
    for (const region of sm.regions) {
      const waitAct    = workflows.WaitForNotificationActivity.createInFlowUnderActivities(flow);
      waitAct.name     = `Wait_${region.forEvent}`;
      waitAct.caption  = `Wait: ${region.forEvent}`;
      const waitLine   = workflows.FlowLine.createIn(wfMeta);
      waitLine.origin      = prevAct;
      waitLine.destination = waitAct;
      prevAct = waitAct;

      const setMfName = `Set${entityName}_${region.forEvent}`;
      const setMf     = microflowMap.get(setMfName);
      if (setMf) {
        const callSetTask    = workflows.CallMicroflowTask.createInFlowUnderActivities(flow);
        callSetTask.name     = `Call_${setMfName}`;
        callSetTask.caption  = `Call: ${setMfName}`;
        callSetTask.microflow = setMf;
        // CE6686 fix: add VoidConditionOutcome so outcomes match
        workflows.VoidConditionOutcome.createIn(callSetTask);
        const callSetLine        = workflows.FlowLine.createIn(wfMeta);
        callSetLine.origin       = prevAct;
        callSetLine.destination  = callSetTask;
        prevAct = callSetTask;
      }

      // B24: entry activity (Create<Child>) in true state
      const trueState = region.states.find(s => s.kind === "true");
      if (trueState?.entryActivity) {
        const createMf = microflowMap.get(trueState.entryActivity);
        if (createMf) {
          const callCreateTask    = workflows.CallMicroflowTask.createInFlowUnderActivities(flow);
          callCreateTask.name     = `Call_${trueState.entryActivity}`;
          callCreateTask.caption  = `Call: ${trueState.entryActivity}`;
          callCreateTask.microflow = createMf;
          workflows.VoidConditionOutcome.createIn(callCreateTask);
          const callCreateLine       = workflows.FlowLine.createIn(wfMeta);
          callCreateLine.origin      = prevAct;
          callCreateLine.destination = callCreateTask;
          prevAct = callCreateTask;
        }
      }
    }

    const endAct    = workflows.EndWorkflowActivity.createInFlowUnderActivities(flow);
    endAct.name     = "End";
    endAct.caption  = "End";
    const endLine   = workflows.FlowLine.createIn(wfMeta);
    endLine.origin      = prevAct;
    endLine.destination = endAct;

    // B11: ACR Microflow that triggers the Workflow
    const acrMf  = microflows.Microflow.createIn(mxModule);
    acrMf.name   = `ACR_${entityName}`;

    const acrObjCol = acrMf.objectCollection;
    const acrStart  = microflows.StartEvent.createIn(acrObjCol);
    const acrEnd    = microflows.EndEvent.createIn(acrObjCol);
    acrStart.relativeMiddlePoint = { x: 0,   y: 0 };
    acrEnd.relativeMiddlePoint   = { x: 300, y: 0 };

    const acrParam = microflows.MicroflowParameterObject.createIn(acrObjCol);
    acrParam.name  = varName;
    acrParam.relativeMiddlePoint = { x: -80, y: 0 };
    const acrObjType  = datatypes.ObjectType.create(model);
    acrObjType.entity = entity;
    acrParam.variableType = acrObjType;

    const acrActionAct = microflows.ActionActivity.createIn(acrObjCol);
    acrActionAct.relativeMiddlePoint = { x: 150, y: 0 };
    const wfCallAct = microflows.WorkflowCallAction.createIn(acrActionAct);
    wfCallAct.workflow                = wf;
    wfCallAct.workflowContextVariable = varName; // ACR microflow passes entity as context

    const acrFlow1       = microflows.SequenceFlow.createIn(acrMf);
    acrFlow1.origin      = acrStart;
    acrFlow1.destination = acrActionAct;
    const acrFlow2       = microflows.SequenceFlow.createIn(acrMf);
    acrFlow2.origin      = acrActionAct;
    acrFlow2.destination = acrEnd;

    console.log(`  + ACR microflow "ACR_${entityName}" → workflow "WF_${entityName}" [${sm.regions.length} region(s)]`);
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
