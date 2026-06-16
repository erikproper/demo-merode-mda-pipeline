// merode-to-pim-agent
// Listens on the bus for MERODE models and transforms them into pimUML models.

import { BusClient } from "./bus-client";
import type { MerodeModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta, TraceEntry } from "./agent-utils";

const config = getBusConfig("merode-to-pim-agent");

const SOURCE_AGENT_ID = process.env.MERODE_PUBLISHER_AGENT_ID ?? "api-server";
const IN_ARTEFACT     = "model.cim.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateMerode = makeValidator("merode-schema.json");
const validatePim    = makeValidator("pimuml-schema.json");

function transform(merode: MerodeModel): { pim: PimModel; trace: TraceEntry[] } {
  const trace: TraceEntry[] = [];

  // each object type becomes a class, its attributes become properties
  const classes = merode.objectTypes.map(ot => {
    trace.push({ sourceType: "ObjectType", sourceName: ot.name, targetType: "Class", targetName: ot.name });
    return {
      name: ot.name,
      ownedAttributes: (ot.attributes ?? []).map(a => {
        trace.push({ sourceType: "Attribute", sourceName: `${ot.name}.${a.name}`, targetType: "Property", targetName: `${ot.name}.${a.name}` });
        return { name: a.name, type: a.type ?? "String" };
      }),
    };
  });

  // each existence dependency becomes an association (dependent = many side, master = one side)
  const associations = (merode.existenceDependencies ?? []).map(dep => {
    trace.push({ sourceType: "ExistenceDependency", sourceName: dep.name, targetType: "Association", targetName: dep.name });
    return {
      name: dep.name,
      memberEnds: [
        { name: "dependent", type: dep.dependent, lower: 0,             upper: "*"            },
        { name: "master",    type: dep.master,    lower: dep.lower ?? 1, upper: dep.upper ?? 1 },
      ] as [any, any],
    };
  });

  // business event types are not yet mapped to pimUML — recorded as NotMapped for evaluation
  for (const bet of merode.businessEventTypes ?? []) {
    trace.push({ sourceType: "BusinessEventType", sourceName: bet.name, targetType: "NotMapped", targetName: "-" });
  }

  return { pim: { name: `${merode.name} – pimUML`, classes, associations }, trace };
}

async function main() {
  console.log(`[merode-to-pim] starting — listening for "${IN_ARTEFACT}" from "${SOURCE_AGENT_ID}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[merode-to-pim] connected to ${config.broker}:${config.port}`);

  bus.subscribeCimState<MerodeModel>(SOURCE_AGENT_ID, IN_ARTEFACT, (rawModel: MerodeModel, timestamp: string) => {
    const { clean: model, meta } = extractMeta(rawModel);

    if (meta._source?.format !== "merode") {
      console.log(`[merode-to-pim] ignoring format "${meta._source?.format}"`);
      return;
    }

    console.log(`[merode-to-pim] received merode model at ${timestamp}`);

    try {
      assertValid(validateMerode, model, "merode-schema.json");
    } catch (err) {
      console.error("[merode-to-pim] invalid input:", (err as Error).message);
      return;
    }

    const { pim: pimModel, trace } = transform(model);
    console.log(`[merode-to-pim] transformed: ${pimModel.classes?.length ?? 0} classes, ${pimModel.associations?.length ?? 0} associations, ${trace.length} trace entries`);

    try {
      assertValid(validatePim, pimModel, "pimuml-schema.json");
    } catch (err) {
      console.error("[merode-to-pim] output invalid:", (err as Error).message);
      return;
    }

    bus.publishPimState(OUT_ARTEFACT, attachMeta(pimModel, { ...meta, _trace: trace }));
    console.log(`[merode-to-pim] published to "${OUT_ARTEFACT}"`);
  });

  console.log("[merode-to-pim] listening … (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[merode-to-pim] unhandled error:", err);
    process.exit(1);
  });
}
