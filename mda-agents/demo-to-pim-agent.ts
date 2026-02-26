/**
 * demo-to-pim-agent.ts
 *
 * BIG Modelling Bus agent: DEMO Fact Model (CIM) → pimUML (PIM)
 *
 * Pipeline:
 *   subscribe(model.demo.raw)            ← DemoModel artefact state
 *     → validate(demo-schema.json)       [AJV, Draft-07]
 *     → transform(A1–A12)               [Table 10.1, 2_mapping_demo_to_pim.md]
 *     → validate(pimuml-schema.json)     [AJV, Draft-07]
 *     → publish(model.pim.created)       → PimModel artefact state
 *
 * Mapping rules applied (Table 10.1):
 *   A1  Categorical value type           → Enumeration
 *   A2  Non-categorical value type       → PrimitiveType
 *   A3  Declared entity type             → Class + logical id (Integer) + StateMachine
 *   A4  Derived entity type              → Class + StateMachine
 *   A5  Attribute type                   → Property
 *   A6  Event type                       → Boolean attr (default false) + orthogonal SM
 *                                           region (initial→false→true) + trigger/effect
 *                                           + Set<Entity>.<Event> activity
 *   A7  Specialization w/ event type     → logical id on child + directed assoc child→parent
 *                                           + entry activity in parent trueState
 *                                           + Create<Child> activity
 *   A8  Specialization of value type     → AssociationClass
 *       w/ event type + property type
 *   A9  Specialization w/ derivation rule→ logical id on child + directed assoc child→parent
 *                                           + Create<Child> activity
 *   A10 Generalization                   → parent.isAbstract = true + Generalization on child
 *   A11 Aggregation                      → shared association + identifier prop in whole
 *   A12 Property type + cardinality laws → Association + multiplicities
 *
 * Dependencies (install before running):
 *   npm install mqtt ajv
 *   npm install --save-dev typescript ts-node @types/node
 *
 * Run:
 *   npx ts-node demo-to-pim-agent.ts
 */

import path   from "path";
import fs     from "fs";
import Ajv    from "ajv";
import { BusClient } from "./bus-client";
import type { DemoModel, PimModel } from "./schemas/types";

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
  agentID:       process.env.BUS_AGENT_ID        ?? "demo-to-pim-agent",
  loadDelayMs:   300,
};

/** Agent ID of the upstream publisher (demo-publisher.ts). */
const DEMO_PUBLISHER_AGENT_ID = process.env.DEMO_PUBLISHER_AGENT_ID ?? "demo-publisher";

const DEMO_ARTEFACT_ID = "model.demo.raw";
const PIM_ARTEFACT_ID  = "model.pim.created";

// =============================================================================
// JSON Schema validation (AJV)
// =============================================================================

const SCHEMAS_DIR = path.resolve(__dirname, "schemas");

function loadSchema(filename: string): object {
  return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), "utf-8"));
}

const ajv = new Ajv({ allErrors: true });

const demoSchema = loadSchema("demo-schema.json");
const pimSchema  = loadSchema("pimuml-schema.json");

const validateDemo = ajv.compile(demoSchema);
const validatePim  = ajv.compile(pimSchema);

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
// Internal PIM working types (match pimuml-schema.json structure exactly)
// =============================================================================

interface IValueSpec       { _type: string; value: unknown }
interface IProperty        { name: string; type?: string; isID?: boolean; aggregation?: "none" | "shared" | "composite"; lower?: number; upper?: number | string; defaultValue?: IValueSpec }
interface IPimGeneralization { general: string }
interface IBehavior        { expression: string }
interface ITrigger         { name: string }
interface ITransition      { source: string; target: string; trigger?: ITrigger; effect?: IBehavior }
interface IState           { _type: "State"; name: string; regions?: IRegion[]; entry?: IBehavior }
interface IPseudostate     { _type: "Pseudostate"; kind: string; name?: string }
type IVertex = IState | IPseudostate;
interface IRegion          { name?: string; subvertices?: IVertex[]; transitions?: ITransition[] }
interface IStateMachine    { name: string; regions: IRegion[] }
interface IControlFlow     { source: string; target: string }
interface IParam           { name: string; type?: string; direction: "in" | "out" | "inout" | "return" }
interface IActivityNode    { _type: string; name: string; [k: string]: unknown }
interface IActivity        { name: string; parameters?: IParam[]; nodes?: IActivityNode[]; edges?: IControlFlow[] }
interface IPimClass        { name: string; isAbstract?: boolean; ownedAttributes?: IProperty[]; generalizations?: IPimGeneralization[]; ownedBehaviors?: IStateMachine[]; ownedActivities?: IActivity[] }
interface IAssociation     { name?: string; memberEnds: [IProperty, IProperty] }
interface IAssocClass      { name: string; memberEnds: [IProperty, IProperty]; ownedAttributes?: IProperty[]; generalizations?: IPimGeneralization[] }
interface IEnumLiteral     { name: string; qualifiedName?: string }
interface IEnumeration     { name: string; literals?: IEnumLiteral[] }
interface IPrimitiveType   { name: string }

interface IPimModel {
  name: string;
  classes:          IPimClass[];
  associations:     IAssociation[];
  associationClasses: IAssocClass[];
  enumerations:     IEnumeration[];
  primitiveTypes:   IPrimitiveType[];
}

// =============================================================================
// Activity helpers
// =============================================================================

/**
 * A6 – Builds the "Set<Entity>.<Event>" activity diagram.
 * Sets the named Boolean attribute on the entity instance to true.
 *
 * Flow: start → entityIn → [trueValue] → setEventAttr → end
 */
function buildSetEventActivity(entityName: string, eventName: string): IActivity {
  const paramName      = `${entityName}Param`;
  const paramNodeName  = `${entityName}In`;
  const trueValName    = `trueValue_${eventName}`;
  const setActionName  = `set_${entityName}_${eventName}`;

  return {
    name: `Set${entityName}.${eventName}`,
    parameters: [
      { name: paramName, type: entityName, direction: "in" },
    ],
    nodes: [
      { _type: "InitialNode",              name: "start" },
      { _type: "ActivityParameterNode",    name: paramNodeName, parameter: paramName },
      { _type: "ValueSpecificationAction", name: trueValName,
        value: { _type: "LiteralBoolean", value: true }, result: `${trueValName}Pin` },
      { _type: "AddStructuralFeatureValueAction", name: setActionName,
        object: paramNodeName, structuralFeature: eventName, value: `${trueValName}Pin` },
      { _type: "ActivityFinalNode",        name: "end" },
    ],
    edges: [
      { source: "start",        target: paramNodeName  },
      { source: paramNodeName,  target: trueValName    },
      { source: trueValName,    target: setActionName  },
      { source: setActionName,  target: "end"          },
    ],
  };
}

/**
 * A7 / A9 – Builds the "Create<Child>" activity diagram.
 * Creates a new instance of the child class and links it to the parent.
 *
 * Flow: start → parentIn → createChild → linkToParent → end
 */
function buildCreateChildActivity(childName: string, parentName: string): IActivity {
  const paramName     = `${parentName}Param`;
  const paramNodeName = `${parentName}In`;
  const createAction  = `create${childName}`;
  const linkAction    = `link${childName}ToParent`;

  return {
    name: `Create${childName}`,
    parameters: [
      { name: paramName, type: parentName, direction: "in" },
    ],
    nodes: [
      { _type: "InitialNode",           name: "start" },
      { _type: "ActivityParameterNode", name: paramNodeName, parameter: paramName },
      { _type: "CreateObjectAction",    name: createAction,  classifier: childName, result: `${childName}Out` },
      { _type: "CreateLinkAction",      name: linkAction,
        endData: [
          { value: `${childName}Out`, end: "self"   },
          { value: paramNodeName,      end: "parent" },
        ] },
      { _type: "ActivityFinalNode",     name: "end" },
    ],
    edges: [
      { source: "start",       target: paramNodeName },
      { source: paramNodeName, target: createAction  },
      { source: createAction,  target: linkAction    },
      { source: linkAction,    target: "end"         },
    ],
  };
}

// =============================================================================
// Transformation: DEMO Fact Model → pimUML (Table 10.1, Rules A1–A12)
// =============================================================================

export function transform(demo: DemoModel): IPimModel {
  const pim: IPimModel = {
    name:               `${demo.name} – pimUML`,
    classes:            [],
    associations:       [],
    associationClasses: [],
    enumerations:       [],
    primitiveTypes:     [],
  };

  // Index: entityName → IPimClass (for cross-rule references)
  const classMap = new Map<string, IPimClass>();

  // Helper: look up the StateMachine of a class (first owned behavior)
  function smOf(cls: IPimClass): IStateMachine | undefined {
    return cls.ownedBehaviors?.[0];
  }

  // ---------------------------------------------------------------------------
  // A1: Value type – user-declared, categorical → Enumeration (class diagram)
  // ---------------------------------------------------------------------------
  for (const vt of demo.valueTypes ?? []) {
    if (vt.kind === "categorical") {
      const literals: IEnumLiteral[] = (vt.literals ?? []).map(l => ({
        name: l,
        qualifiedName: `${vt.name}::${l}`,
      }));
      pim.enumerations.push({
        name: vt.name,
        ...(literals.length > 0 ? { literals } : {}),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // A2: Value type – user-declared, non-categorical → User-defined data type
  //     (PrimitiveType in class diagram)
  // ---------------------------------------------------------------------------
  for (const vt of demo.valueTypes ?? []) {
    if (vt.kind === "non-categorical") {
      pim.primitiveTypes.push({ name: vt.name });
    }
  }

  // ---------------------------------------------------------------------------
  // A3: Declared entity type → Class (class diagram)
  //                          + Logical identifier (integer) (class diagram)
  //                          + State machine (state machine diagram)
  // ---------------------------------------------------------------------------
  for (const et of demo.entityTypes) {
    if (et.kind !== "declared") continue;

    const sm: IStateMachine = { name: `${et.name}StateMachine`, regions: [] };

    const cls: IPimClass = {
      name: et.name,
      isAbstract: false,
      // Logical identifier: Integer property, isID = true
      ownedAttributes: [
        { name: "id", type: "Integer", isID: true },
      ],
      ownedBehaviors: [sm],
    };

    classMap.set(et.name, cls);
    pim.classes.push(cls);
  }

  // ---------------------------------------------------------------------------
  // A4: Derived entity type → Class (class diagram)
  //                         + State machine (state machine diagram)
  //     Note: logical identifier is NOT added here; A7/A9 add it for
  //     specialization-based derived types.
  // ---------------------------------------------------------------------------
  for (const et of demo.entityTypes) {
    if (et.kind !== "derived") continue;

    const sm: IStateMachine = { name: `${et.name}StateMachine`, regions: [] };

    const cls: IPimClass = {
      name: et.name,
      isAbstract: false,
      ownedAttributes: [],
      ownedBehaviors: [sm],
    };

    classMap.set(et.name, cls);
    pim.classes.push(cls);
  }

  // ---------------------------------------------------------------------------
  // A5: Attribute type → Property (class diagram)
  //     Each attribute type of an entity type becomes an owned Property.
  // ---------------------------------------------------------------------------
  for (const et of demo.entityTypes) {
    const cls = classMap.get(et.name);
    if (!cls) continue;

    for (const attr of et.attributes ?? []) {
      cls.ownedAttributes = cls.ownedAttributes ?? [];
      cls.ownedAttributes.push({ name: attr.name, type: attr.valueType });
    }
  }

  // ---------------------------------------------------------------------------
  // A6: Event type →
  //   (a) Boolean attribute, default false (class diagram)
  //   (b) Orthogonal region for corresponding Boolean (state machine diagram)
  //       with: initial Pseudostate, false State, true State
  //   (c) Transition from initial node to false state [t1]
  //       Transition from false state to true state [t2]
  //         with Trigger + Alf expression effect behavior
  //   (d) Set<Entity>.<Event> activity (activity diagram)
  // ---------------------------------------------------------------------------
  for (const et of demo.entityTypes) {
    const cls = classMap.get(et.name);
    if (!cls) continue;

    for (const evt of et.events ?? []) {
      const initName  = `${et.name}_${evt.name}_initial`;
      const falseName = `${et.name}_${evt.name}_false`;
      const trueName  = `${et.name}_${evt.name}_true`;

      // (a) Boolean attribute, default false
      cls.ownedAttributes = cls.ownedAttributes ?? [];
      cls.ownedAttributes.push({
        name: evt.name,
        type: "Boolean",
        defaultValue: { _type: "LiteralBoolean", value: false },
      });

      // (b+c) Orthogonal region in StateMachine
      const region: IRegion = {
        name: `region_${evt.name}`,
        subvertices: [
          // Initial Pseudostate
          { _type: "Pseudostate", kind: "initial", name: initName },
          // false State (default — event has not yet occurred)
          { _type: "State", name: falseName },
          // true State (event has occurred)
          { _type: "State", name: trueName },
        ],
        transitions: [
          // t1: initial node → false state (A6)
          { source: initName, target: falseName },
          // t2: false state → true state, with Trigger and Alf effect (A6)
          {
            source: falseName,
            target: trueName,
            trigger: { name: `trigger_${evt.name}` },
            effect: { expression: `Set${et.name}.${evt.name}` },
          },
        ],
      };

      smOf(cls)?.regions.push(region);

      // (d) Set<Entity>.<Event> activity
      cls.ownedActivities = cls.ownedActivities ?? [];
      cls.ownedActivities.push(buildSetEventActivity(et.name, evt.name));
    }
  }

  // Post-A6: ensure every StateMachine has at least 1 region (schema: minItems 1).
  // Entities with no events get a minimal "main" region with only an initial node.
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

  // ---------------------------------------------------------------------------
  // A7: Specialization of entity type with event type →
  //   (a) Logical identifier for child class (class diagram)
  //   (b) Directed association from child to parent with "parent" role
  //       (state machine diagram)
  //   (c) Entry activity in the corresponding true state of the parent
  //       (state machine diagram): expression = "Create<Child>"
  //   (d) Create<Child> activity (activity diagram) owned by the parent class
  // ---------------------------------------------------------------------------
  for (const gen of demo.generalizations ?? []) {
    if (gen.specializationKind !== "eventType") continue;

    const childCls  = classMap.get(gen.child);
    const parentCls = classMap.get(gen.parent);

    // (a) Logical identifier for child class
    if (childCls) {
      childCls.ownedAttributes = childCls.ownedAttributes ?? [];
      const alreadyHasId = childCls.ownedAttributes.some(p => p.isID);
      if (!alreadyHasId) {
        childCls.ownedAttributes.unshift({ name: "id", type: "Integer", isID: true });
      }
    }

    // (b) Directed association child → parent with "parent" role
    pim.associations.push({
      name: `${gen.child}_to_${gen.parent}`,
      memberEnds: [
        { name: "self",   type: gen.child,  lower: 1, upper: 1 },
        { name: "parent", type: gen.parent, lower: 1, upper: 1 },
      ],
    });

    // (c) Entry activity in the corresponding true state of the parent SM
    //     True state name follows A6 naming: <ParentEntity>_<eventName>_true
    if (parentCls && gen.eventType) {
      const trueName = `${gen.parent}_${gen.eventType}_true`;
      const parentSm = smOf(parentCls);
      if (parentSm) {
        for (const region of parentSm.regions) {
          for (const v of region.subvertices ?? []) {
            if (v._type === "State" && v.name === trueName) {
              (v as IState).entry = { expression: `Create${gen.child}` };
            }
          }
        }
      }
    }

    // (d) Create<Child> activity owned by the parent class
    if (parentCls) {
      parentCls.ownedActivities = parentCls.ownedActivities ?? [];
      parentCls.ownedActivities.push(
        buildCreateChildActivity(gen.child, gen.parent),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // A8: Specialization of value type with event type + property type →
  //     Association class (class diagram)
  //     Identified by: Generalization.propertyType being set
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // A9: Specialization of entity type with derivation rule →
  //   (a) Identifier property for child class (class diagram)
  //   (b) Directed association from child to parent with "parent" role
  //       (class diagram)
  //   (c) OCL expression for derivation rule stored as effect on the
  //       child-to-parent association (approximation: derivationRule text
  //       from the DEMO EntityType)
  //   (d) Create<Child> activity owned by the parent class (activity diagram)
  // ---------------------------------------------------------------------------
  for (const gen of demo.generalizations ?? []) {
    if (gen.specializationKind !== "derivationRule") continue;

    const childCls  = classMap.get(gen.child);
    const parentCls = classMap.get(gen.parent);

    // (a) Identifier property for child class
    if (childCls) {
      childCls.ownedAttributes = childCls.ownedAttributes ?? [];
      const alreadyHasId = childCls.ownedAttributes.some(p => p.isID);
      if (!alreadyHasId) {
        childCls.ownedAttributes.unshift({ name: "id", type: "Integer", isID: true });
      }
    }

    // Retrieve the OCL derivation rule from the child EntityType (if present)
    const childEntity = demo.entityTypes.find(et => et.name === gen.child);
    const oclExpr = (childEntity as { derivationRule?: string })?.derivationRule ?? "";

    // (b+c) Directed association child → parent; OCL expression as trigger name
    pim.associations.push({
      name: `${gen.child}_to_${gen.parent}`,
      memberEnds: [
        { name: "self",   type: gen.child,  lower: 1, upper: 1 },
        { name: "parent", type: gen.parent, lower: 1, upper: 1 },
      ],
    });

    // (c) Note: OCL expression is emitted as a log entry — the schema does not
    //     have a dedicated OCL constraint field; it would be stored as a
    //     Class constraint or comment in a full UML tool.
    if (oclExpr) {
      console.info(
        `[A9] OCL derivation rule for ${gen.child} → ${gen.parent}: "${oclExpr}"`,
      );
    }

    // (d) Create<Child> activity owned by the parent class
    if (parentCls) {
      parentCls.ownedActivities = parentCls.ownedActivities ?? [];
      parentCls.ownedActivities.push(
        buildCreateChildActivity(gen.child, gen.parent),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // A10: Generalization →
  //   (a) Abstract parent (parent.isAbstract = true) (class diagram)
  //   (b) Generalization relationship from child to parent (class diagram)
  //   Applied to ALL generalizations (A7, A8, A9, and pure A10).
  // ---------------------------------------------------------------------------
  for (const gen of demo.generalizations ?? []) {
    // (a) Parent becomes abstract
    const parentCls = classMap.get(gen.parent);
    if (parentCls) {
      parentCls.isAbstract = true;
    }

    // (b) Generalization on child class (skip A8 AssociationClasses; they have
    //     their own generalizations array if needed)
    if (!gen.propertyType) {
      const childCls = classMap.get(gen.child);
      if (childCls) {
        childCls.generalizations = childCls.generalizations ?? [];
        const alreadyLinked = childCls.generalizations.some(g => g.general === gen.parent);
        if (!alreadyLinked) {
          childCls.generalizations.push({ general: gen.parent });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // A11: Aggregation →
  //   (a) Identifier property in whole class corresponding to each part class
  //       (class diagram)
  //   (b) Association with shared aggregation adornment (class diagram)
  // ---------------------------------------------------------------------------
  for (const agg of demo.aggregations ?? []) {
    const wholeCls = classMap.get(agg.whole);

    // (a) Identifier property in the whole class for the part
    if (wholeCls) {
      wholeCls.ownedAttributes = wholeCls.ownedAttributes ?? [];
      wholeCls.ownedAttributes.push({
        name: `${agg.part.charAt(0).toLowerCase()}${agg.part.slice(1)}Id`,
        type:  "Integer",
        isID:  false,
      });
    }

    // (b) Association with shared aggregation adornment on the whole end
    pim.associations.push({
      name: `${agg.whole}_aggregates_${agg.part}`,
      memberEnds: [
        { name: agg.whole.charAt(0).toLowerCase() + agg.whole.slice(1),
          type: agg.whole, aggregation: "shared" },
        { name: agg.part.charAt(0).toLowerCase()  + agg.part.slice(1),
          type: agg.part, lower: 0, upper: "*" },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // A12: Property type + Cardinality laws →
  //   Association (class diagram) with Multiplicities (class diagram)
  // ---------------------------------------------------------------------------
  for (const pt of demo.propertyTypes ?? []) {
    const srcLower = pt.lowerCardinality ?? 0;
    const srcUpper: number | "*" =
      pt.upperCardinality === "*" ? "*"
      : typeof pt.upperCardinality === "number" ? pt.upperCardinality
      : "*";

    pim.associations.push({
      ...(pt.name ? { name: pt.name } : {}),
      memberEnds: [
        { name: pt.source.charAt(0).toLowerCase() + pt.source.slice(1),
          type: pt.source, lower: srcLower, upper: srcUpper },
        { name: pt.target.charAt(0).toLowerCase() + pt.target.slice(1),
          type: pt.target },
      ],
    });
  }

  return pim;
}

// =============================================================================
// Agent main
// =============================================================================

async function main(): Promise<void> {
  console.log("[demo-to-pim-agent] Starting …");
  console.log(`[demo-to-pim-agent] Subscribing to artefact "${DEMO_ARTEFACT_ID}" from agent "${DEMO_PUBLISHER_AGENT_ID}"`);
  console.log(`[demo-to-pim-agent] Will publish to artefact "${PIM_ARTEFACT_ID}"`);

  const bus = new BusClient(config);

  try {
    await bus.connect();
    console.log(`[demo-to-pim-agent] Connected to ${config.broker}:${config.port}`);
  } catch (err) {
    console.error("[demo-to-pim-agent] Connection failed:", err);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Subscribe to DemoModel artefact state
  // ---------------------------------------------------------------------------
  bus.subscribeDemoState(
    DEMO_PUBLISHER_AGENT_ID,
    DEMO_ARTEFACT_ID,
    (model: DemoModel, timestamp: string) => {
      console.log(`\n[demo-to-pim-agent] Received DemoModel at ${timestamp}`);
      console.log(`  name: "${model.name}"`);
      console.log(`  entityTypes: ${model.entityTypes.length}`);

      // -----------------------------------------------------------------------
      // Step 1: Validate incoming DemoModel against demo-schema.json (AJV)
      // -----------------------------------------------------------------------
      try {
        assertValid(validateDemo, model, "demo-schema.json");
        console.log("[demo-to-pim-agent] ✓ Input valid against demo-schema.json");
      } catch (err) {
        console.error("[demo-to-pim-agent] ✗ Input validation failed — aborting transformation");
        console.error((err as Error).message);
        return;
      }

      // -----------------------------------------------------------------------
      // Step 2: Apply mapping rules A1–A12
      // -----------------------------------------------------------------------
      let pimModel: IPimModel;
      try {
        pimModel = transform(model);
        console.log("[demo-to-pim-agent] ✓ Transformation complete");
        console.log(`  classes:          ${pimModel.classes.length}`);
        console.log(`  associations:     ${pimModel.associations.length}`);
        console.log(`  associationClasses: ${pimModel.associationClasses.length}`);
        console.log(`  enumerations:     ${pimModel.enumerations.length}`);
        console.log(`  primitiveTypes:   ${pimModel.primitiveTypes.length}`);
      } catch (err) {
        console.error("[demo-to-pim-agent] ✗ Transformation error:", (err as Error).message);
        return;
      }

      // -----------------------------------------------------------------------
      // Step 3: Validate PimModel output against pimuml-schema.json (AJV)
      // -----------------------------------------------------------------------
      try {
        assertValid(validatePim, pimModel, "pimuml-schema.json");
        console.log("[demo-to-pim-agent] ✓ Output valid against pimuml-schema.json");
      } catch (err) {
        console.error("[demo-to-pim-agent] ✗ Output validation failed — not publishing");
        console.error((err as Error).message);
        return;
      }

      // -----------------------------------------------------------------------
      // Step 4: Publish PimModel as artefact state on model.pim.created
      // -----------------------------------------------------------------------
      bus.publishPimState(PIM_ARTEFACT_ID, pimModel as unknown as PimModel);
      console.log(`[demo-to-pim-agent] ✓ Published PimModel to artefact "${PIM_ARTEFACT_ID}"`);
    },
  );

  console.log("[demo-to-pim-agent] Listening … (Ctrl+C to stop)");
}

// Only start the agent when run directly (not when imported by tests).
if (require.main === module) {
  main().catch((err) => {
    console.error("[demo-to-pim-agent] Unhandled error:", err);
    process.exit(1);
  });
}
