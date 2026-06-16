// merode-to-pim-agent
// Listens on the bus for MERODE models and transforms them into pimUML models.

import { BusClient } from "./bus-client";
import type { MerodeModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta } from "./agent-utils";

const config = getBusConfig("merode-to-pim-agent");

const SOURCE_AGENT_ID = process.env.MERODE_PUBLISHER_AGENT_ID ?? "api-server";
const IN_ARTEFACT     = "model.cim.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateMerode = makeValidator("merode-schema.json");
const validatePim    = makeValidator("pimuml-schema.json");

function transform(merode: MerodeModel): PimModel {
  return {
    name: `${merode.name} – pimUML`,

    // each object type becomes a class, its attributes become properties
    classes: merode.objectTypes.map(ot => ({
      name: ot.name,
      ownedAttributes: (ot.attributes ?? []).map(a => ({
        name: a.name,
        type: a.type ?? "String",
      })),
    })),

    // each existence dependency becomes an association
    // the dependent object is the "many" side (0..*), the master is the "one" side (1..1)
    associations: (merode.existenceDependencies ?? []).map(dep => ({
      name: dep.name,
      memberEnds: [
        { name: "dependent", type: dep.dependent, lower: 0,          upper: "*"       },
        { name: "master",    type: dep.master,    lower: dep.lower ?? 1, upper: dep.upper ?? 1 },
      ],
    })),
  };
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

    const pimModel = transform(model);
    console.log(`[merode-to-pim] transformed: ${pimModel.classes?.length ?? 0} classes, ${pimModel.associations?.length ?? 0} associations`);

    try {
      assertValid(validatePim, pimModel, "pimuml-schema.json");
    } catch (err) {
      console.error("[merode-to-pim] output invalid:", (err as Error).message);
      return;
    }

    bus.publishPimState(OUT_ARTEFACT, attachMeta(pimModel, meta));
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
