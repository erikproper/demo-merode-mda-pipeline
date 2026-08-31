// Subscribes to model.pim.created on the bus and prints every received PimModel.
// Run while demo-to-pim-agent is running:
//   npx ts-node tests/pim-subscriber.ts

import path from "path";
import fs   from "fs";
import { BusClient } from "../bus-client";
import type { PimModel } from "../schemas/types";

const config = {
  broker:        process.env.MQTT_BROKER        ?? "localhost",
  port:          parseInt(process.env.MQTT_PORT ?? "1883", 10),
  user:          process.env.MQTT_USER          ?? "admin",
  password:      process.env.MQTT_PASSWORD      ?? "admin",
  prefix:        process.env.BUS_PREFIX         ?? "big",
  environmentID: process.env.BUS_ENVIRONMENT_ID ?? "dev",
  agentID:       "pim-subscriber",
  loadDelayMs:   500,
};

const FROM_AGENT  = process.env.FROM_AGENT ?? "demo-to-pim-agent";
const ARTEFACT_ID = "model.pim.created";

async function main() {
  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[pim-subscriber] connected - waiting for PimModel from "${FROM_AGENT}" ...`);

  bus.subscribePimState(FROM_AGENT, ARTEFACT_ID, (model: PimModel, timestamp: string) => {
    console.log(`\nReceived PimModel at ${timestamp}`);
    console.log(`  name   : ${model.name}`);
    console.log(`  classes: ${model.classes?.length ?? 0}`);

    for (const cls of model.classes ?? []) {
      const attrs = cls.ownedAttributes?.map(a => `${a.name}: ${a.type ?? "String"}`).join(", ") ?? "";
      console.log(`    - ${cls.name}  { ${attrs} }`);
    }

    const outPath = path.resolve(__dirname, "rent-a-car-pim-from-bus.json");
    fs.writeFileSync(outPath, JSON.stringify(model, null, 2), "utf-8");
    console.log(`  written to: tests/rent-a-car-pim-from-bus.json`);
  });
}

main().catch(err => {
  console.error("[pim-subscriber] error:", err);
  process.exit(1);
});
