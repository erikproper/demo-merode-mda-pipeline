// pim-to-mendix-agent
// Listens on the bus for pimUML models and writes them into a Mendix app via the Platform SDK.

import { IModel, domainmodels, enumerations, microflows, workflows, datatypes, pages, navigation, menus, texts } from "mendixmodelsdk";
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
    case "integer":          return domainmodels.IntegerAttributeType.create(model);
    case "boolean":          return domainmodels.BooleanAttributeType.create(model);
    case "datetime":         return domainmodels.DateTimeAttributeType.create(model);
    case "real":
    case "decimal":          return domainmodels.DecimalAttributeType.create(model);
    default:                 return domainmodels.StringAttributeType.create(model);
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
  model.allPages().filter(p => (p.qualifiedName ?? "").startsWith(prefix) && (p.name ?? "").endsWith("_Overview")).forEach(p => p.delete());
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
  const associationMap = new Map<string, domainmodels.Association>();
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
    if (assoc.isAggregation || assoc.isDerived || assoc.triggerEvent) {
      mxAssoc.owner = domainmodels.AssociationOwner.Both;
    }
    associationMap.set(assoc.name, mxAssoc);
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

      // B20+B21+B18+B19: create-kind → full Create microflow body
      // CreateObjectAction → CreateVariableAction(parentID) → ChangeObjectAction(childID) → ChangeObjectAction(assoc link)
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
          // B16: parameter — parent entity object
          const mfParam = microflows.MicroflowParameterObject.createIn(objCol);
          mfParam.name  = parentVar;
          mfParam.relativeMiddlePoint = { x: -80, y: 0 };
          const paramType = datatypes.ObjectType.create(model);
          paramType.entity = parentEntity;
          mfParam.variableType = paramType;

          // B20: CreateObjectAction — instantiate child; B18+B19 inlined as MemberChanges
          // (CreateVariableAction skipped: SDK cannot set variable type → defaults to Boolean.
          //  Expressions are inlined directly to avoid CE0117.)
          const createAct = microflows.ActionActivity.createIn(objCol);
          createAct.relativeMiddlePoint = { x: 100, y: 0 };
          const createObj = microflows.CreateObjectAction.createIn(createAct);
          createObj.entity = childEntity;
          createObj.outputVariableName = childVar;
          createObj.commit = microflows.CommitEnum.Yes;

          // B18: copy parent's logical ID into child's ID attribute
          if (childIDAttr) {
            const mc1 = microflows.MemberChange.createIn(createObj);
            mc1.attribute = childIDAttr;
            mc1.value = `$${parentVar}/${parentName}ID`;
          }

          // B19: set association link to parent
          if (mxAssoc) {
            const mc2 = microflows.MemberChange.createIn(createObj);
            mc2.association = mxAssoc;
            mc2.value = `$${parentVar}`;
          }

          end.relativeMiddlePoint = { x: 280, y: 0 };

          const f1 = microflows.SequenceFlow.createIn(mf); f1.origin = start;    f1.destination = createAct;
          const f2 = microflows.SequenceFlow.createIn(mf); f2.origin = createAct; f2.destination = end;

          console.log(`  + microflow "${activity.name}" [create ${childName} from ${parentName}]${!mxAssoc ? " ⚠ no association found" : ""}`);
          continue;
        }
      }

      // B16/B18: set-kind → MicroflowParameterObject + ChangeObjectAction (sets boolean event attribute)
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

          console.log(`  + microflow "${activity.name}" [set ${setEntityName}.${eventName} = true] ⚠ CE0049: click OK once in Studio Pro`);
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
        // KNOWN LIMITATION (CE6685 – "Parameters of the selected microflow have changed"):
        // MicroflowCallParameterMapping.parameter requires a MicroflowParameter object,
        // which cannot be created via the SDK (same root cause as CE0049).
        // Fix: open each CallMicroflowTask in Studio Pro and click OK once — Studio Pro
        // then auto-creates the parameter binding (WorkflowContext → rental parameter).
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
          // KNOWN LIMITATION (CE6685): same as above — open and click OK in Studio Pro.
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
    //
    // KNOWN LIMITATION (CE0049 – "No variable name specified"):
    // The Mendix SDK does not expose MicroflowParameter (the logical scope variable
    // that the CE checker requires for WorkflowCallAction.workflowContextVariable).
    // MicroflowParameterObject (the visual canvas element) is created and populated
    // correctly so the Studio Pro dropdown works, but the CE0049 error persists until
    // the user opens the WorkflowCallAction dialog in Studio Pro and clicks OK once.
    // All SDK-level workarounds attempted (CREATE_ELEMENT_TREE delta injection,
    // CREATE_UNIT_TREE interception, hasVariableNameBeenChanged flag) were rejected
    // or silently ignored by the Mendix model server.
    const varName = entityName.charAt(0).toLowerCase() + entityName.slice(1);

    const acrMf  = microflows.Microflow.createIn(mxModule);
    acrMf.name   = `ACR_${entityName}`;

    const acrObjCol  = acrMf.objectCollection;
    const acrStart   = microflows.StartEvent.createIn(acrObjCol);
    const acrEnd     = microflows.EndEvent.createIn(acrObjCol);
    acrStart.relativeMiddlePoint = { x: 0,   y: 0 };
    acrEnd.relativeMiddlePoint   = { x: 300, y: 0 };

    // MicroflowParameterObject: visual canvas element — populates the Object dropdown
    // in the WorkflowCallAction dialog so the user can confirm the selection manually.
    const acrParam   = microflows.MicroflowParameterObject.createIn(acrObjCol);
    acrParam.name    = varName;
    acrParam.relativeMiddlePoint = { x: -80, y: 0 };
    const objType    = datatypes.ObjectType.create(model);
    objType.entity   = entity;
    acrParam.variableType = objType;

    const acrActionAct = microflows.ActionActivity.createIn(acrObjCol);
    acrActionAct.relativeMiddlePoint = { x: 150, y: 0 };
    const wfCallAct = microflows.WorkflowCallAction.createIn(acrActionAct);
    wfCallAct.workflow                = wf;
    wfCallAct.workflowContextVariable = varName;
    wfCallAct.useReturnVariable       = false;

    const acrFlow1       = microflows.SequenceFlow.createIn(acrMf);
    acrFlow1.origin      = acrStart;
    acrFlow1.destination = acrActionAct;
    const acrFlow2       = microflows.SequenceFlow.createIn(acrMf);
    acrFlow2.origin      = acrActionAct;
    acrFlow2.destination = acrEnd;

    console.log(`  + ACR microflow "ACR_${entityName}" → workflow "WF_${entityName}" [${sm.regions.length} region(s)]`);
  }

  // ── Pages + Navigation ────────────────────────────────────────────────────────
  // Find a web layout by borrowing the reference from any existing page outside
  // our module. A blank Mendix starter app always has at least one pre-built page
  // that already has a valid Atlas layout wired up.
  let webLayout: pages.ILayout | null = null;
  let contentParam: pages.ILayoutParameter | null = null;

  // Deep-search helper: traverses all known Mendix widget container types recursively.
  // Atlas layouts often nest LayoutParameters inside ScrollContainer regions rather
  // than top-level widget lists, so a shallow .widgets check is not enough.
  const findLayoutParam = (obj: any, depth = 0): pages.ILayoutParameter | null => {
    if (!obj || typeof obj !== "object" || depth > 20) return null;
    if (obj.structureTypeName === "Pages$LayoutParameter") return obj as pages.ILayoutParameter;

    // Lists: widgets, rows, columns, tabPages
    for (const listKey of ["widgets", "rows", "columns", "tabPages", "items"]) {
      try {
        const list = obj[listKey];
        if (!list) continue;
        for (const item of list) {
          const found = findLayoutParam(item, depth + 1);
          if (found) return found;
        }
      } catch { /* skip deleted/inaccessible SDK properties */ }
    }
    // ScrollContainer named regions: center, top, bottom, left, right
    for (const regionKey of ["center", "top", "bottom", "left", "right",
                              "topRegion", "centerRegion", "bottomRegion",
                              "leftRegion", "rightRegion",
                              "firstRegion", "secondRegion"]) {
      try {
        const region = obj[regionKey];
        if (!region || typeof region !== "object") continue;
        const found = findLayoutParam(region, depth + 1);
        if (found) return found;
      } catch { /* skip */ }
    }
    // Single-widget references (note: "widget" singular is deleted since Mendix 7.15 → skip)
    for (const childKey of ["leftWidget", "rightWidget",
                             "headerWidget", "footerWidget", "content"]) {
      try {
        const child = obj[childKey];
        if (!child || typeof child !== "object") continue;
        const found = findLayoutParam(child, depth + 1);
        if (found) return found;
      } catch { /* skip deleted/inaccessible SDK properties */ }
    }
    return null;
  };

  // Strategy 1: borrow from an existing non-module page that already has a LayoutCallArgument.
  for (const pg of model.allPages()) {
    if ((pg.qualifiedName ?? "").startsWith(prefix)) continue;
    const fp  = await pg.load();
    const arg = fp.layoutCall?.arguments?.[0];
    if (arg?.parameter) {
      webLayout    = fp.layoutCall!.layout;
      contentParam = arg.parameter;
      console.log(`[pim-to-mendix] layout parameter borrowed from page "${pg.qualifiedName}"`);
      break;
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

  // Strategy 3: load all candidate layouts and deep-search their widget trees for
  // a LayoutParameter. Handles ScrollContainer regions, LayoutGrid columns, etc.
  if (!contentParam) {
    const candidates = model.allLayouts().filter(l => {
      const n = (l.qualifiedName ?? "").toLowerCase();
      return !n.includes("popup") && !n.includes("native") && !n.includes("login");
    });

    for (const layout of candidates) {
      const loaded = await layout.load();
      const wlc    = (loaded as pages.Layout).content as pages.WebLayoutContent | null;
      if (!wlc) continue;

      // Search the top-level widget list
      const found = findLayoutParam(wlc);
      if (found) {
        webLayout    = layout;
        contentParam = found;
        console.log(`[pim-to-mendix] layout parameter found via deep-traversal in "${layout.qualifiedName}" (param: "${(found as any).qualifiedName ?? "?"}")`);
        break;
      }

      // Also try findLayoutParameterByQualifiedName with common Atlas names
      const lqn = loaded.qualifiedName ?? "";
      for (const name of ["Content", "Main", "Page", "Body", "Center", "Sidebar", "TopBar"]) {
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
      console.warn(`[pim-to-mendix] no LayoutParameter found in any layout — pages will render without content widgets`);
    }
  }

  if (!webLayout) {
    console.warn("[pim-to-mendix] no suitable layout found — skipping page generation");
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

      // Layout
      const lc = page.layoutCall;
      lc.layout = webLayout;

      if (contentParam) {
        const lca = pages.LayoutCallArgument.createIn(lc);
        lca.parameter = contentParam;

        // Workflow trigger button — only for entities that have an ACR microflow
        const hasSM = pimModel.stateMachines?.some(sm => sm.entityType === cls.name && sm.regions.length > 0) ?? false;
        const acrMf = hasSM ? microflowMap.get(`ACR_${cls.name}`) : undefined;
        if (acrMf) {
          const btn  = pages.ActionButton.createInLayoutCallArgumentUnderWidgets(lca);
          const ct   = texts.Text.createInClientTemplateUnderTemplate(btn.caption);
          const tr   = texts.Translation.createIn(ct);
          tr.languageCode = "en_US";
          tr.text = `Start ${cls.name} Workflow`;
          const mca = pages.MicroflowClientAction.createInActionButtonUnderAction(btn);
          const ms  = pages.MicroflowSettings.createInMicroflowClientActionUnderMicroflowSettings(mca);
          ms.microflow = acrMf;
        }
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
