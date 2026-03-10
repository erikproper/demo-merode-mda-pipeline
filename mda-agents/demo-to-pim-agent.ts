// Agent B — DEMO (CIM) → pimUML (PIM)
//
// Listens on the bus for a DEMO model, transforms it to a PIM class diagram,
// validates the result, and publishes it so Agent C can pick it up.
//
// Mapping rules (domain model only):
//   A1  Categorical value type      → Enumeration
//   A2  Non-categorical value type  → PrimitiveType
//   A3  Declared entity type        → Class + logical id attribute
//   A4  Derived entity type         → Class
//   A5  Attribute                   → Property on the class
//   A6  Event type                  → Boolean attribute
//   A7  Specialization (event)      → id on child + Association child→parent
//   A8  Specialization (value type) → AssociationClass
//   A9  Specialization (derivation) → id on child + Association child→parent
//   A10 Generalization              → abstract parent + Generalization on child
//   A11 Aggregation                 → shared Association + id prop in whole
//   A12 Property type + cardinality → Association with multiplicities

import { BusClient }                from "./bus-client";
import type { DemoModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta } from "./agent-utils";

const config = getBusConfig("demo-to-pim-agent");

const SOURCE_AGENT_ID = process.env.DEMO_PUBLISHER_AGENT_ID ?? "demo-publisher";
const IN_ARTEFACT     = "model.demo.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateDemo = makeValidator("demo-schema.json");
const validatePim  = makeValidator("pimuml-schema.json");

// Minimal local types that mirror the parts of pimuml-schema.json we actually use.
interface IProperty      { name: string; type?: string; isID?: boolean; aggregation?: "none" | "shared" | "composite"; lower?: number; upper?: number | string; defaultValue?: { _type: string; value: unknown } }
interface IGeneralization { general: string }
interface IPimClass      { name: string; isAbstract?: boolean; ownedAttributes?: IProperty[]; generalizations?: IGeneralization[] }
interface IAssociation   { name?: string; memberEnds: [IProperty, IProperty] }
interface IAssocClass    { name: string; memberEnds: [IProperty, IProperty] }
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

// Core transformation — applies rules A1–A12 to produce a PIM class diagram.
export function transform(demo: DemoModel): IPimModel {
  const pim: IPimModel = {
    name:               `${demo.name} – pimUML`,
    classes:            [],
    associations:       [],
    associationClasses: [],
    enumerations:       [],
    primitiveTypes:     [],
  };

  const classMap = new Map<string, IPimClass>();

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

  // A3 — declared entity type → Class + logical id attribute
  for (const et of demo.entityTypes) {
    if (et.kind !== "declared") continue;
    const cls: IPimClass = {
      name:            et.name,
      isAbstract:      false,
      ownedAttributes: [{ name: "id", type: "Integer", isID: true }],
    };
    classMap.set(et.name, cls);
    pim.classes.push(cls);
  }

  // A4 — derived entity type → Class
  for (const et of demo.entityTypes) {
    if (et.kind !== "derived") continue;
    const cls: IPimClass = { name: et.name, isAbstract: false, ownedAttributes: [] };
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

  // A6 — event type → Boolean attribute (defaultValue: false)
  for (const et of demo.entityTypes) {
    const cls = classMap.get(et.name);
    if (!cls) continue;
    for (const evt of et.events ?? []) {
      cls.ownedAttributes = cls.ownedAttributes ?? [];
      cls.ownedAttributes.push({
        name: evt.name,
        type: "Boolean",
        defaultValue: { _type: "LiteralBoolean", value: false },
      });
    }
  }

  // A7 — specialization with event type → id on child + Association child→parent
  for (const gen of demo.generalizations ?? []) {
    if (gen.specializationKind !== "eventType") continue;
    const childCls = classMap.get(gen.child);
    if (childCls && !childCls.ownedAttributes?.some(p => p.isID)) {
      childCls.ownedAttributes = childCls.ownedAttributes ?? [];
      childCls.ownedAttributes.unshift({ name: "id", type: "Integer", isID: true });
    }
    pim.associations.push({
      name: `${gen.child}_to_${gen.parent}`,
      memberEnds: [
        { name: "self",   type: gen.child,  lower: 1, upper: 1 },
        { name: "parent", type: gen.parent, lower: 1, upper: 1 },
      ],
    });
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

  // A9 — specialization with derivation rule → id on child + Association child→parent
  for (const gen of demo.generalizations ?? []) {
    if (gen.specializationKind !== "derivationRule") continue;
    const childCls = classMap.get(gen.child);
    if (childCls && !childCls.ownedAttributes?.some(p => p.isID)) {
      childCls.ownedAttributes = childCls.ownedAttributes ?? [];
      childCls.ownedAttributes.unshift({ name: "id", type: "Integer", isID: true });
    }
    pim.associations.push({
      name: `${gen.child}_to_${gen.parent}`,
      memberEnds: [
        { name: "self",   type: gen.child,  lower: 1, upper: 1 },
        { name: "parent", type: gen.parent, lower: 1, upper: 1 },
      ],
    });
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

  // A11 — aggregation → id prop in whole class + shared Association
  for (const agg of demo.aggregations ?? []) {
    const wholeCls = classMap.get(agg.whole);
    if (wholeCls) {
      wholeCls.ownedAttributes = wholeCls.ownedAttributes ?? [];
      wholeCls.ownedAttributes.push({
        name: `${agg.part.charAt(0).toLowerCase()}${agg.part.slice(1)}Id`,
        type: "Integer",
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

  // A12 — property type with cardinality → Association
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
    console.log(`[demo-to-pim] received model at ${timestamp}`);

    const { clean: model, meta } = extractMeta(rawModel);
    if (meta._target) console.log(`[demo-to-pim] target override: ${JSON.stringify(meta._target)}`);

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
