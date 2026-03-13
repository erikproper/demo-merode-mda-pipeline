// Agent B — DEMO (CIM) → pimUML (PIM)
//
// Rule A3: Each entity type in DEMO becomes a class in PIM.
// Rule A5: Each attribute of an entity type becomes a property on that class.

import { BusClient } from "./bus-client";
import type { DemoModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta } from "./agent-utils";

const config = getBusConfig("demo-to-pim-agent");

const SOURCE_AGENT_ID = process.env.DEMO_PUBLISHER_AGENT_ID ?? "demo-publisher";
const IN_ARTEFACT     = "model.demo.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateDemo = makeValidator("demo-schema.json");
const validatePim  = makeValidator("pimuml-schema.json");

function transform(demo: DemoModel): PimModel {
  return {
    name: `${demo.name} – pimUML`,
    classes: demo.entityTypes.map(et => ({
      name: et.name,
      ownedAttributes: (et.attributes ?? []).map(a => ({
        name: a.name,
        type: a.valueType ?? "String",
      })),
    })),
  };
}

async function main() {
  console.log(`[demo-to-pim] starting — listening for "${IN_ARTEFACT}" from "${SOURCE_AGENT_ID}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[demo-to-pim] connected to ${config.broker}:${config.port}`);

  bus.subscribeDemoState(SOURCE_AGENT_ID, IN_ARTEFACT, (rawModel: DemoModel, timestamp: string) => {
    console.log(`[demo-to-pim] received model at ${timestamp}`);

    const { clean: model, meta } = extractMeta(rawModel);

    try {
      assertValid(validateDemo, model, "demo-schema.json");
    } catch (err) {
      console.error("[demo-to-pim] invalid input:", (err as Error).message);
      return;
    }

    const pimModel = transform(model);
    console.log(`[demo-to-pim] transformed: ${pimModel.classes?.length ?? 0} classes`);

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
