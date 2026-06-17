// demo-to-pim-agent
// Listens on the bus for DEMO Fact Models and transforms them into pimUML models.

import { BusClient } from "./bus-client";
import type { DemoModel, PimModel, Property } from "./schemas/types";
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

  // non-categorical value types → user-defined data types (A2)
  const dataTypes = (demo.valueTypes ?? [])
    .filter(vt => vt.kind === "nonCategorical")
    .map(vt => {
      trace.push({ sourceType: "ValueType", sourceName: vt.name, targetType: "DataType", targetName: vt.name });
      return { name: vt.name };
    });

  // each entity type becomes a class, its attributes become properties (A3, A5)
  const classes = demo.entityTypes.map(et => {
    trace.push({ sourceType: "EntityType", sourceName: et.name, targetType: "Class", targetName: et.name });
    const ownedAttributes: Property[] = (et.attributes ?? []).map(a => {
      const isDerived = a.derivationRule !== undefined;
      trace.push({
        sourceType: isDerived ? "DerivedAttributeType" : "AttributeType",
        sourceName: `${et.name}.${a.name}`,
        targetType: isDerived ? "DerivedProperty" : "Property",
        targetName: `${et.name}.${a.name}`,
      });
      return { name: a.name, type: a.valueType ?? "String", isDerived, derivationRule: a.derivationRule };
    });
    return { name: et.name, isAbstract: et.isAbstract ?? false, ownedAttributes };
  });

  // generalizations → parent-child relationships between classes (A10)
  // any entity with isAbstract:true is also marked abstract on the class
  const generalizations = demo.entityTypes
    .filter(et => et.parent !== undefined)
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

  // each fact type becomes an association between two classes (A12, A11)
  const associations = (demo.factTypes ?? []).map(ft => {
    const targetType = ft.isAggregation ? "Aggregation" : "Association";
    trace.push({ sourceType: "FactType", sourceName: ft.name, targetType, targetName: ft.name });
    return {
      name: ft.name,
      isAggregation: ft.isAggregation ?? false,
      memberEnds: [
        { name: ft.roles[0].name, type: ft.roles[0].entityType, lower: ft.roles[0].lower ?? 0, upper: ft.roles[0].upper ?? "*" },
        { name: ft.roles[1].name, type: ft.roles[1].entityType, lower: ft.roles[1].lower ?? 1, upper: ft.roles[1].upper ?? 1 },
      ] as [any, any],
    };
  });

  return { pim: { name: `${demo.name} – pimUML`, enumerations, dataTypes, classes, associations, generalizations }, trace };
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
