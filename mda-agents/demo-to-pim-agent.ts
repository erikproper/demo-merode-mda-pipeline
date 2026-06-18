// demo-to-pim-agent
// Listens on the bus for DEMO Fact Models and transforms them into pimUML models.

import { BusClient } from "./bus-client";
import type { DemoModel, PimModel, PimStateMachine, PimRegion, PimActivity, Property } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta, TraceEntry } from "./agent-utils";

const config = getBusConfig("demo-to-pim-agent");

const SOURCE_AGENT_ID = process.env.DEMO_PUBLISHER_AGENT_ID ?? "api-server";
const IN_ARTEFACT     = "model.cim.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateDemo = makeValidator("demo-schema.json");
const validatePim  = makeValidator("pimuml-schema.json");

function transform(demo: DemoModel): { pim: PimModel; trace: TraceEntry[] } {
  const trace: TraceEntry[] = [];

  // categorical value types → enumerations (A1)
  const enumerations = (demo.valueTypes ?? [])
    .filter(vt => vt.kind === "categorical")
    .map(vt => {
      trace.push({ sourceType: "ValueType", sourceName: vt.name, targetType: "Enumeration", targetName: vt.name });
      return { name: vt.name, literals: vt.literals! };
    });

  // non-categorical value types with event + entity relation → association classes (A8)
  const associationClasses = (demo.valueTypes ?? [])
    .filter(vt => vt.kind === "nonCategorical" && vt.triggerEventType && vt.relatesEntityTypes)
    .map(vt => {
      trace.push({ sourceType: "ValueType", sourceName: vt.name, targetType: "AssociationClass", targetName: vt.name });
      const [e0, e1] = vt.relatesEntityTypes!;
      const ownedAttributes: Property[] = (vt.attributes ?? []).map(a => {
        trace.push({ sourceType: "AttributeType", sourceName: `${vt.name}.${a.name}`, targetType: "Property", targetName: `${vt.name}.${a.name}` });
        return { name: a.name, type: a.valueType ?? "String" };
      });
      return {
        name: vt.name,
        triggerEvent: vt.triggerEventType,
        memberEnds: [
          { name: e0.toLowerCase(), type: e0, lower: 0, upper: "*" },
          { name: e1.toLowerCase(), type: e1, lower: 0, upper: "*" },
        ] as [any, any],
        ownedAttributes,
      };
    });

  // non-categorical value types → user-defined data types (A2)
  const dataTypes = (demo.valueTypes ?? [])
    .filter(vt => vt.kind === "nonCategorical" && !vt.triggerEventType)
    .map(vt => {
      trace.push({ sourceType: "ValueType", sourceName: vt.name, targetType: "DataType", targetName: vt.name });
      return { name: vt.name };
    });

  // each entity type becomes a class, its attributes become properties (A3, A5)
  const classes = demo.entityTypes.map(et => {
    trace.push({ sourceType: et.isDerived ? "DerivedEntityType" : "EntityType", sourceName: et.name, targetType: "Class", targetName: et.name });
    // logical identifier — one integer ID per entity type (B6)
    const idProp: Property = { name: `${et.name}ID`, type: "Integer", isID: true };
    trace.push({ sourceType: "EntityType", sourceName: et.name, targetType: "Property", targetName: `${et.name}.${et.name}ID` });
    const ownedAttributes: Property[] = [idProp, ...(et.attributes ?? []).map(a => {
      const isDerived = a.derivationRule !== undefined;
      trace.push({
        sourceType: isDerived ? "DerivedAttributeType" : "AttributeType",
        sourceName: `${et.name}.${a.name}`,
        targetType: isDerived ? "DerivedProperty" : "Property",
        targetName: `${et.name}.${a.name}`,
      });
      return { name: a.name, type: a.valueType ?? "String", isDerived, derivationRule: a.derivationRule };
    })];
    return { name: et.name, isAbstract: et.isAbstract ?? false, isDerived: et.isDerived ?? false, derivationExpression: et.derivationExpression, ownedAttributes };
  });

  // generalizations → parent-child relationships between classes (A10)
  // only non-derived, non-event-triggered specializations
  const generalizations = demo.entityTypes
    .filter(et => et.parent !== undefined && !et.isDerived && !et.triggerEventType)
    .map(et => {
      trace.push({ sourceType: "EntityType", sourceName: et.name, targetType: "Generalization", targetName: `${et.parent} → ${et.name}` });
      const parentClass = classes.find(c => c.name === et.parent);
      if (parentClass) parentClass.isAbstract = true;
      return { child: et.name, parent: et.parent! };
    });

  // event types → Boolean attributes on the owning class (A6)
  for (const et of demo.eventTypes ?? []) {
    const cls = classes.find(c => c.name === et.entityType);
    if (!cls) { console.warn(`[demo-to-pim] eventType "${et.name}" references unknown entityType "${et.entityType}"`); continue; }
    trace.push({ sourceType: "EventType", sourceName: et.name, targetType: "Property", targetName: `${et.entityType}.${et.name}` });
    cls.ownedAttributes = cls.ownedAttributes ?? [];
    cls.ownedAttributes.push({ name: et.name, type: "Boolean", defaultValue: "false" });
  }

  // event-triggered specializations → directed association + trigger reference (A7)
  // state machine behavior (entry activity, Create<child>) is NotMapped in Mendix
  const eventTriggeredAssociations = demo.entityTypes
    .filter(et => et.parent !== undefined && et.triggerEventType)
    .map(et => {
      trace.push({ sourceType: "EntityType", sourceName: et.name, targetType: "EventTriggeredAssociation", targetName: `${et.name}IsA${et.parent}` });
      trace.push({ sourceType: "EventType", sourceName: et.triggerEventType!, targetType: "NotMapped", targetName: "StateMachineBehavior" });
      return {
        name: `${et.name}IsA${et.parent}`,
        triggerEvent: et.triggerEventType,
        memberEnds: [
          { name: "specialization", type: et.name,    lower: 0, upper: "*" },
          { name: "parent",         type: et.parent!, lower: 1, upper: 1   },
        ] as [any, any],
      };
    });

  // derived specializations → directed associations with OCL expression (A9)
  const derivedAssociations = demo.entityTypes
    .filter(et => et.isDerived && et.parent !== undefined)
    .map(et => {
      trace.push({ sourceType: "DerivedEntityType", sourceName: et.name, targetType: "DerivedAssociation", targetName: `${et.name}IsA${et.parent}` });
      return {
        name: `${et.name}IsA${et.parent}`,
        isDerived: true,
        derivationExpression: et.derivationExpression,
        memberEnds: [
          { name: "derived", type: et.name,    lower: 0, upper: "*" },
          { name: "parent",  type: et.parent!, lower: 1, upper: 1   },
        ] as [any, any],
      };
    });

  // each fact type becomes an association between two classes (A12, A11)
  const associations = [
    ...(demo.factTypes ?? []).map(ft => {
      const targetType = ft.isAggregation ? "Aggregation" : "Association";
      trace.push({ sourceType: "FactType", sourceName: ft.name, targetType, targetName: ft.name });

      // A11: for aggregations, add identifier property to the whole class for each part class
      if (ft.isAggregation) {
        const wholeRole = ft.roles.find(r => r.upper === 1) ?? ft.roles[0];
        const partRole  = ft.roles.find(r => r.upper === "*" || (r.upper ?? 0) > 1) ?? ft.roles[1];
        const wholeClass = classes.find(c => c.name === wholeRole.entityType);
        if (wholeClass) {
          const propName = `${partRole.name}ID`;
          if (!wholeClass.ownedAttributes?.some(p => p.name === propName)) {
            wholeClass.ownedAttributes = wholeClass.ownedAttributes ?? [];
            wholeClass.ownedAttributes.push({ name: propName, type: "Integer" });
            trace.push({ sourceType: "FactType", sourceName: ft.name, targetType: "Property", targetName: `${wholeRole.entityType}.${propName}` });
          }
        }
      }

      return {
        name: ft.name,
        isAggregation: ft.isAggregation ?? false,
        memberEnds: [
          { name: ft.roles[0].name, type: ft.roles[0].entityType, lower: ft.roles[0].lower ?? 0, upper: ft.roles[0].upper ?? "*" },
          { name: ft.roles[1].name, type: ft.roles[1].entityType, lower: ft.roles[1].lower ?? 1, upper: ft.roles[1].upper ?? 1 },
        ] as [any, any],
      };
    }),
    ...derivedAssociations,
    ...eventTriggeredAssociations,
  ];

  // state machines — one per entity type, one orthogonal region per event type (A3, A4, A6, A7, A9)
  const stateMachines: PimStateMachine[] = demo.entityTypes.map(et => {
    const ownEvents = (demo.eventTypes ?? []).filter(ev => ev.entityType === et.name);

    // event-triggered specializations whose parent is this entity type → entry activities in true state
    const triggeredChildren = demo.entityTypes.filter(child => child.parent === et.name && child.triggerEventType);

    const regions: PimRegion[] = ownEvents.map(ev => {
      const falseState = `${ev.name}_false`;
      const trueState  = `${ev.name}_true`;

      // A7: if a child specialization is triggered by this event, add entry activity
      const childForEvent = triggeredChildren.find(c => c.triggerEventType === ev.name);
      const entryActivity = childForEvent ? `Create${childForEvent.name}` : undefined;

      trace.push({ sourceType: "EventType", sourceName: ev.name, targetType: "Region", targetName: `${et.name}.${ev.name}` });

      return {
        name: ev.name,
        forEvent: ev.name,
        states: [
          { name: `${ev.name}_initial`, kind: "initial" },
          { name: falseState, kind: "false" },
          { name: trueState, kind: "true", ...(entryActivity ? { entryActivity } : {}) },
        ],
        transitions: [
          { from: `${ev.name}_initial`, to: falseState },
          {
            from: falseState,
            to: trueState,
            trigger: ev.name,
            alfExpression: `self.${ev.name} = true`,
          },
        ],
      };
    });

    // activities: Set<entity>.<event> for each event (A6), Create<child> for specializations (A7, A9)
    const activities: PimActivity[] = [
      ...ownEvents.map(ev => ({ name: `Set${et.name}_${ev.name}`, kind: "set" as const, targetType: et.name })),
      ...triggeredChildren.map(c  => ({ name: `Create${c.name}`, kind: "create" as const, targetType: c.name })),
      ...demo.entityTypes.filter(c => c.isDerived && c.parent === et.name).map(c => ({ name: `Create${c.name}`, kind: "create" as const, targetType: c.name })),
    ];

    trace.push({ sourceType: et.isDerived ? "DerivedEntityType" : "EntityType", sourceName: et.name, targetType: "StateMachine", targetName: `SM_${et.name}` });

    return { name: `SM_${et.name}`, entityType: et.name, regions, ...(activities.length > 0 ? { activities } : {}) };
  });

  return { pim: { name: `${demo.name} – pimUML`, enumerations, dataTypes, associationClasses, classes, associations, generalizations, stateMachines }, trace };
}

async function main() {
  console.log(`[demo-to-pim] starting — listening for "${IN_ARTEFACT}" from "${SOURCE_AGENT_ID}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[demo-to-pim] connected to ${config.broker}:${config.port}`);

  bus.subscribeCimState<DemoModel>(SOURCE_AGENT_ID, IN_ARTEFACT, (rawModel: DemoModel, timestamp: string) => {
    const { clean: model, meta } = extractMeta(rawModel);

    if (meta._source?.format !== "demo") {
      console.log(`[demo-to-pim] ignoring format "${meta._source?.format}"`);
      return;
    }

    console.log(`[demo-to-pim] received demo model at ${timestamp}`);

    try {
      assertValid(validateDemo, model, "demo-schema.json");
    } catch (err) {
      console.error("[demo-to-pim] invalid input:", (err as Error).message);
      return;
    }

    const { pim: pimModel, trace } = transform(model);
    console.log(`[demo-to-pim] transformed: ${pimModel.enumerations?.length ?? 0} enumerations, ${pimModel.classes?.length ?? 0} classes, ${pimModel.associations?.length ?? 0} associations, ${trace.length} trace entries`);

    try {
      assertValid(validatePim, pimModel, "pimuml-schema.json");
    } catch (err) {
      console.error("[demo-to-pim] output invalid:", (err as Error).message);
      return;
    }

    bus.publishPimState(OUT_ARTEFACT, attachMeta(pimModel, { ...meta, _trace: trace }));
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
