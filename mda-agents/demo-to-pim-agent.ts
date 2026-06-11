// demo-to-pim-agent
// Listens on the bus for DEMO Fact Models and transforms them into pimUML models.

import { BusClient } from "./bus-client";
import type { DemoModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta } from "./agent-utils";

const config = getBusConfig("demo-to-pim-agent");

const SOURCE_AGENT_ID = process.env.DEMO_PUBLISHER_AGENT_ID ?? "api-server";
const IN_ARTEFACT     = "model.cim.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateDemo = makeValidator("demo-schema.json");
const validatePim  = makeValidator("pimuml-schema.json");

function transform(demo: DemoModel): PimModel {
  return {
    name: `${demo.name} – pimUML`,

    // each entity type becomes a class, its attributes become properties
    classes: demo.entityTypes.map(et => ({
      name: et.name,
      ownedAttributes: (et.attributes ?? []).map(a => ({
        name: a.name,
        type: a.valueType ?? "String",
      })),
    })),

    // each fact type becomes an association between two classes
    associations: (demo.factTypes ?? []).map(ft => ({
      name: ft.name,
      memberEnds: [
        {
          name:  ft.roles[0].name,
          type:  ft.roles[0].entityType,
          lower: ft.roles[0].lower ?? 0,
          upper: ft.roles[0].upper ?? "*",
        },
        {
          name:  ft.roles[1].name,
          type:  ft.roles[1].entityType,
          lower: ft.roles[1].lower ?? 1,
          upper: ft.roles[1].upper ?? 1,
        },
      ],
    })),
  };
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

    const pimModel = transform(model);
    console.log(`[demo-to-pim] transformed: ${pimModel.classes?.length ?? 0} classes, ${pimModel.associations?.length ?? 0} associations`);

    try {
      assertValid(validatePim, pimModel, "pimuml-schema.json");
    } catch (err) {
      console.error("[demo-to-pim] output invalid:", (err as Error).message);
      return;
    }

    bus.publishPimState(OUT_ARTEFACT, attachMeta(pimModel, meta));
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
