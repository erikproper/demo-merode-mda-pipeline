// Agent B — DEMO (CIM) → pimUML (PIM)
//
// Listens on the bus for a DEMO model, transforms it using mapping rules
// A1–A12 (see thesis Table 10.1), validates the result, and publishes
// the PIM model so the next agent (pim-to-mendix) can pick it up.
//
// Mapping rules:
//   A1  Categorical value type      → Enumeration
//   A2  Non-categorical value type  → PrimitiveType
//   A3  Declared entity type        → Class + logical id + StateMachine
//   A4  Derived entity type         → Class + StateMachine
//   A5  Attribute                   → Property
//   A6  Event type                  → Boolean attr + SM region + activity
//   A7  Specialization (event)      → id on child + assoc + Create<Child> activity
//   A8  Specialization (value type) → AssociationClass
//   A9  Specialization (derivation) → id on child + assoc + Create<Child> activity
//   A10 Generalization              → abstract parent + Generalization on child
//   A11 Aggregation                 → shared assoc + id prop in whole
//   A12 Property type + cardinality → Association with multiplicities

import { BusClient }                from "./bus-client";
import type { DemoModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta } from "./agent-utils";

const config = getBusConfig("demo-to-pim-agent");

// The upstream publisher is usually the api-server, but can be overridden
// (e.g. the demo-publisher script used for local testing).
const SOURCE_AGENT_ID = process.env.DEMO_PUBLISHER_AGENT_ID ?? "demo-publisher";
const IN_ARTEFACT     = "model.demo.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateDemo = makeValidator("demo-schema.json");
const validatePim  = makeValidator("pimuml-schema.json");

// Internal types that mirror pimuml-schema.json.
// Using these locally avoids TypeScript conflicts while building the PIM object.
interface IValueSpec     { _type: string; value: unknown }
interface IProperty      { name: string; type?: string; isID?: boolean; aggregation?: "none" | "shared" | "composite"; lower?: number; upper?: number | string; defaultValue?: IValueSpec }
interface IGeneralization { general: string }
interface IBehavior      { expression: string }
interface ITrigger       { name: string }
interface ITransition    { source: string; target: string; trigger?: ITrigger; effect?: IBehavior }
interface IState         { _type: "State"; name: string; regions?: IRegion[]; entry?: IBehavior }
interface IPseudostate   { _type: "Pseudostate"; kind: string; name?: string }
type IVertex = IState | IPseudostate;
interface IRegion        { name?: string; subvertices?: IVertex[]; transitions?: ITransition[] }
interface IStateMachine  { name: string; regions: IRegion[] }
interface IControlFlow   { source: string; target: string }
interface IParam         { name: string; type?: string; direction: "in" | "out" | "inout" | "return" }
interface IActivityNode  { _type: string; name: string; [k: string]: unknown }
interface IActivity      { name: string; parameters?: IParam[]; nodes?: IActivityNode[]; edges?: IControlFlow[] }
interface IPimClass      { name: string; isAbstract?: boolean; ownedAttributes?: IProperty[]; generalizations?: IGeneralization[]; ownedBehaviors?: IStateMachine[]; ownedActivities?: IActivity[] }
interface IAssociation   { name?: string; memberEnds: [IProperty, IProperty] }
interface IAssocClass    { name: string; memberEnds: [IProperty, IProperty]; ownedAttributes?: IProperty[]; generalizations?: IGeneralization[] }
interface IEnumLiteral   { name: string; qualifiedName?: string }
interface IEnumeration   { name: string; literals?: IEnumLiteral[] }
interface IPrimitive     { name: string }

interface IPimModel {
  name:               string;
  classes:            IPimClass[];
  associations:       IAssociation[];
  associationClasses: IAssocClass[];
  enumerations:       IEnumeration[];
  primitiveTypes:     IPrimitive[];
}

// A6 helper — builds the "Set<Entity>.<Event>" activity diagram.
// This activity sets a Boolean attribute to true on an entity instance.
// Flow: start → entityIn → trueValue → setAttr → end
function buildSetEventActivity(entityName: string, eventName: string): IActivity {
  const param     = `${entityName}Param`;
  const paramNode = `${entityName}In`;
  const trueVal   = `trueValue_${eventName}`;
  const setAction = `set_${entityName}_${eventName}`;

  return {
    name: `Set${entityName}.${eventName}`,
    parameters: [{ name: param, type: entityName, direction: "in" }],
    nodes: [
      { _type: "InitialNode",                    name: "start" },
      { _type: "ActivityParameterNode",          name: paramNode, parameter: param },
      { _type: "ValueSpecificationAction",       name: trueVal, value: { _type: "LiteralBoolean", value: true }, result: `${trueVal}Pin` },
      { _type: "AddStructuralFeatureValueAction", name: setAction, object: paramNode, structuralFeature: eventName, value: `${trueVal}Pin` },
      { _type: "ActivityFinalNode",              name: "end" },
    ],
    edges: [
      { source: "start",     target: paramNode  },
      { source: paramNode,   target: trueVal    },
      { source: trueVal,     target: setAction  },
      { source: setAction,   target: "end"      },
    ],
  };
}

// A7/A9 helper — builds the "Create<Child>" activity diagram.
// Flow: start → parentIn → createChild → linkToParent → end
function buildCreateChildActivity(childName: string, parentName: string): IActivity {
  const param      = `${parentName}Param`;
  const paramNode  = `${parentName}In`;
  const createNode = `create${childName}`;
  const linkNode   = `link${childName}ToParent`;

  return {
    name: `Create${childName}`,
    parameters: [{ name: param, type: parentName, direction: "in" }],
    nodes: [
      { _type: "InitialNode",           name: "start" },
      { _type: "ActivityParameterNode", name: paramNode,  parameter: param },
      { _type: "CreateObjectAction",    name: createNode, classifier: childName, result: `${childName}Out` },
      { _type: "CreateLinkAction",      name: linkNode,
        endData: [{ value: `${childName}Out`, end: "self" }, { value: paramNode, end: "parent" }] },
      { _type: "ActivityFinalNode",     name: "end" },
    ],
    edges: [
      { source: "start",      target: paramNode  },
      { source: paramNode,    target: createNode },
      { source: createNode,   target: linkNode   },
      { source: linkNode,     target: "end"      },
    ],
  };
}

// Core transformation — applies rules A1–A12 to produce a PIM model.
export function transform(demo: DemoModel): IPimModel {
  const pim: IPimModel = {
    name:               `${demo.name} – pimUML`,
    classes:            [],
    associations:       [],
    associationClasses: [],
    enumerations:       [],
    primitiveTypes:     [],
  };

  // classMap lets later rules look up a class by entity name without searching the array.
  const classMap = new Map<string, IPimClass>();
  const smOf = (cls: IPimClass) => cls.ownedBehaviors?.[0];

  // A1 — categorical value type → Enumeration
  for (const vt of demo.valueTypes ?? []) {
    if (vt.kind !== "categorical") continue;
    const literals = (vt.literals ?? []).map(l => ({ name: l, qualifiedName: `${vt.name}::${l}` }));
    pim.enumerations.push({ name: vt.name, ...(literals.length > 0 && { literals }) });
  }

  // A2 — non-categorical value type → PrimitiveType
  for (const vt of demo.valueTypes ?? []) {
    if (vt.kind === "non-categorical") pim.primitiveTypes.push({ name: vt.name });
  }

  // A3 — declared entity type → Class + logical id (isID) + StateMachine
  for (const et of demo.entityTypes) {
    if (et.kind !== "declared") continue;
    const sm: IStateMachine = { name: `${et.name}StateMachine`, regions: [] };
    const cls: IPimClass = {
      name:            et.name,
      isAbstract:      false,
      ownedAttributes: [{ name: "id", type: "Integer", isID: true }],
      ownedBehaviors:  [sm],
    };
    classMap.set(et.name, cls);
    pim.classes.push(cls);
  }

  // A4 — derived entity type → Class + StateMachine (no logical id here)
  for (const et of demo.entityTypes) {
    if (et.kind !== "derived") continue;
    const sm: IStateMachine = { name: `${et.name}StateMachine`, regions: [] };
    const cls: IPimClass = { name: et.name, isAbstract: false, ownedAttributes: [], ownedBehaviors: [sm] };
    classMap.set(et.name, cls);
    pim.classes.push(cls);
  }

  // A5 — attribute → Property on the owning class
  for (const et of demo.entityTypes) {
    const cls = classMap.get(et.name);
    if (!cls) continue;
    for (const attr of et.attributes ?? []) {
      cls.ownedAttributes = cls.ownedAttributes ?? [];
      cls.ownedAttributes.push({ name: attr.name, type: attr.valueType });
    }
  }

  // A6 — event type → Boolean attribute + SM region (false→true) + Set activity
  for (const et of demo.entityTypes) {
    const cls = classMap.get(et.name);
    if (!cls) continue;
    for (const evt of et.events ?? []) {
      const initState  = `${et.name}_${evt.name}_initial`;
      const falseState = `${et.name}_${evt.name}_false`;
      const trueState  = `${et.name}_${evt.name}_true`;

      cls.ownedAttributes = cls.ownedAttributes ?? [];
      cls.ownedAttributes.push({ name: evt.name, type: "Boolean", defaultValue: { _type: "LiteralBoolean", value: false } });

      smOf(cls)?.regions.push({
        name: `region_${evt.name}`,
        subvertices: [
          { _type: "Pseudostate", kind: "initial", name: initState },
          { _type: "State", name: falseState },
          { _type: "State", name: trueState },
        ],
        transitions: [
          { source: initState, target: falseState },
          { source: falseState, target: trueState, trigger: { name: `trigger_${evt.name}` }, effect: { expression: `Set${et.name}.${evt.name}` } },
        ],
      });

      cls.ownedActivities = cls.ownedActivities ?? [];
      cls.ownedActivities.push(buildSetEventActivity(et.name, evt.name));
    }
  }

  // Every StateMachine needs at least one region — add an empty "main" region
  // to entities that have no events (otherwise the schema rejects them).
  for (const cls of pim.classes) {
    const sm = smOf(cls);
    if (sm && sm.regions.length === 0) {
      sm.regions.push({
        name: "main",
        subvertices: [{ _type: "Pseudostate", kind: "initial", name: `${cls.name}_initial` }],
        transitions: [],
      });
    }
  }

  // A7 — specialization with event type → id on child + assoc child→parent + Create activity
  for (const gen of demo.generalizations ?? []) {
    if (gen.specializationKind !== "eventType") continue;
    const childCls  = classMap.get(gen.child);
    const parentCls = classMap.get(gen.parent);

    if (childCls) {
      childCls.ownedAttributes = childCls.ownedAttributes ?? [];
      if (!childCls.ownedAttributes.some(p => p.isID)) {
        childCls.ownedAttributes.unshift({ name: "id", type: "Integer", isID: true });
      }
    }

    pim.associations.push({
      name: `${gen.child}_to_${gen.parent}`,
      memberEnds: [
        { name: "self",   type: gen.child,  lower: 1, upper: 1 },
        { name: "parent", type: gen.parent, lower: 1, upper: 1 },
      ],
    });

    // Add entry activity on the parent's "true" state so it triggers Create<Child>
    if (parentCls && gen.eventType) {
      const trueStateName = `${gen.parent}_${gen.eventType}_true`;
      for (const region of smOf(parentCls)?.regions ?? []) {
        for (const v of region.subvertices ?? []) {
          if (v._type === "State" && v.name === trueStateName) {
            (v as IState).entry = { expression: `Create${gen.child}` };
          }
        }
      }
      parentCls.ownedActivities = parentCls.ownedActivities ?? [];
      parentCls.ownedActivities.push(buildCreateChildActivity(gen.child, gen.parent));
    }
  }

  // A8 — specialization with property type → AssociationClass
  for (const gen of demo.generalizations ?? []) {
    if (!gen.propertyType) continue;
    pim.associationClasses.push({
      name: gen.child,
      memberEnds: [
        { name: gen.parent.toLowerCase(), type: gen.parent },
        { name: gen.propertyType,         type: gen.propertyType },
      ],
    });
  }

  // A9 — specialization with derivation rule → id on child + assoc + Create activity
  for (const gen of demo.generalizations ?? []) {
    if (gen.specializationKind !== "derivationRule") continue;
    const childCls  = classMap.get(gen.child);
    const parentCls = classMap.get(gen.parent);

    if (childCls) {
      childCls.ownedAttributes = childCls.ownedAttributes ?? [];
      if (!childCls.ownedAttributes.some(p => p.isID)) {
        childCls.ownedAttributes.unshift({ name: "id", type: "Integer", isID: true });
      }
    }

    pim.associations.push({
      name: `${gen.child}_to_${gen.parent}`,
      memberEnds: [
        { name: "self",   type: gen.child,  lower: 1, upper: 1 },
        { name: "parent", type: gen.parent, lower: 1, upper: 1 },
      ],
    });

    const oclExpr = (demo.entityTypes.find(et => et.name === gen.child) as any)?.derivationRule ?? "";
    if (oclExpr) console.info(`[A9] derivation rule for ${gen.child}: "${oclExpr}"`);

    if (parentCls) {
      parentCls.ownedActivities = parentCls.ownedActivities ?? [];
      parentCls.ownedActivities.push(buildCreateChildActivity(gen.child, gen.parent));
    }
  }

  // A10 — generalization → abstract parent + Generalization link on child
  for (const gen of demo.generalizations ?? []) {
    const parentCls = classMap.get(gen.parent);
    if (parentCls) parentCls.isAbstract = true;

    if (!gen.propertyType) {
      const childCls = classMap.get(gen.child);
      if (childCls) {
        childCls.generalizations = childCls.generalizations ?? [];
        if (!childCls.generalizations.some(g => g.general === gen.parent)) {
          childCls.generalizations.push({ general: gen.parent });
        }
      }
    }
  }

  // A11 — aggregation → id prop in whole class + shared association
  for (const agg of demo.aggregations ?? []) {
    const wholeCls = classMap.get(agg.whole);
    if (wholeCls) {
      wholeCls.ownedAttributes = wholeCls.ownedAttributes ?? [];
      wholeCls.ownedAttributes.push({
        name: `${agg.part.charAt(0).toLowerCase()}${agg.part.slice(1)}Id`,
        type: "Integer",
        isID: false,
      });
    }
    pim.associations.push({
      name: `${agg.whole}_aggregates_${agg.part}`,
      memberEnds: [
        { name: agg.whole.charAt(0).toLowerCase() + agg.whole.slice(1), type: agg.whole, aggregation: "shared" },
        { name: agg.part.charAt(0).toLowerCase()  + agg.part.slice(1),  type: agg.part, lower: 0, upper: "*" },
      ],
    });
  }

  // A12 — property type with cardinality → Association with multiplicities
  for (const pt of demo.propertyTypes ?? []) {
    const upper: number | "*" = pt.upperCardinality === "*" ? "*"
      : typeof pt.upperCardinality === "number" ? pt.upperCardinality : "*";
    pim.associations.push({
      ...(pt.name && { name: pt.name }),
      memberEnds: [
        { name: pt.source.charAt(0).toLowerCase() + pt.source.slice(1), type: pt.source, lower: pt.lowerCardinality ?? 0, upper },
        { name: pt.target.charAt(0).toLowerCase() + pt.target.slice(1), type: pt.target },
      ],
    });
  }

  return pim;
}

async function main() {
  console.log(`[demo-to-pim] starting — listening for "${IN_ARTEFACT}" from "${SOURCE_AGENT_ID}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[demo-to-pim] connected to ${config.broker}:${config.port}`);

  bus.subscribeDemoState(SOURCE_AGENT_ID, IN_ARTEFACT, (rawModel: DemoModel, timestamp: string) => {
    console.log(`\n[demo-to-pim] received model at ${timestamp}`);

    // Strip _source/_target before schema validation, save them for later.
    const { clean: model, meta } = extractMeta(rawModel);
    if (meta._target) console.log(`[demo-to-pim]   target override: ${JSON.stringify(meta._target)}`);

    try {
      assertValid(validateDemo, model, "demo-schema.json");
    } catch (err) {
      console.error("[demo-to-pim] invalid input:", (err as Error).message);
      return;
    }

    let pimModel: IPimModel;
    try {
      pimModel = transform(model);
      console.log(`[demo-to-pim] transformed: ${pimModel.classes.length} classes, ${pimModel.associations.length} associations`);
    } catch (err) {
      console.error("[demo-to-pim] transform failed:", (err as Error).message);
      return;
    }

    try {
      assertValid(validatePim, pimModel, "pimuml-schema.json");
    } catch (err) {
      console.error("[demo-to-pim] output invalid, not publishing:", (err as Error).message);
      return;
    }

    // Re-attach metadata so the next agent gets the routing info.
    bus.publishPimState(OUT_ARTEFACT, attachMeta(pimModel as unknown as PimModel, meta));
    console.log(`[demo-to-pim] published to "${OUT_ARTEFACT}"`);
  });

  console.log("[demo-to-pim] listening … (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[demo-to-pim] unhandled error:", err);
    process.exit(1);
  });
}
