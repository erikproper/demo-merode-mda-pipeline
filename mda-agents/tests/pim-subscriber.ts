/**
 * pim-subscriber.ts
 *
 * Subscribes to model.pim.created on the BIG Modelling Bus and prints
 * every received PimModel to console + writes it to disk.
 *
 * Run AFTER demo-to-pim-agent is running:
 *   npx ts-node tests/pim-subscriber.ts
 */

import path from "path";
import fs   from "fs";
import { BusClient } from "../bus-client";
import type { PimModel } from "../schemas/types";

const config = {
  broker:        process.env.MQTT_BROKER         ?? "localhost",
  port:          parseInt(process.env.MQTT_PORT  ?? "1883", 10),
  user:          process.env.MQTT_USER           ?? "admin",
  password:      process.env.MQTT_PASSWORD       ?? "admin",
  prefix:        process.env.BUS_PREFIX          ?? "big",
  environmentID: process.env.BUS_ENVIRONMENT_ID ?? "dev",
  agentID:       "pim-subscriber",
  loadDelayMs:   500,
};

const FROM_AGENT   = process.env.FROM_AGENT ?? "demo-to-pim-agent";
const ARTEFACT_ID  = "model.pim.created";

async function main() {
  const bus = new BusClient(config);

  console.log(`[pim-subscriber] Connecting to ${config.broker}:${config.port} …`);
  await bus.connect();
  console.log(`[pim-subscriber] Connected.`);
  console.log(`[pim-subscriber] Waiting for PimModel from "${FROM_AGENT}" on "${ARTEFACT_ID}" …\n`);

  bus.subscribePimState(FROM_AGENT, ARTEFACT_ID, (model: PimModel, timestamp: string) => {
    console.log("=".repeat(60));
    console.log(`RECEIVED PimModel  at ${timestamp}`);
    console.log("=".repeat(60));
    console.log(`  name              : ${model.name}`);
    console.log(`  classes           : ${model.classes?.length ?? 0}`);
    console.log(`  associations      : ${model.associations?.length ?? 0}`);
    console.log(`  associationClasses: ${model.associationClasses?.length ?? 0}`);
    console.log(`  enumerations      : ${model.enumerations?.length ?? 0}`);
    console.log(`  primitiveTypes    : ${model.primitiveTypes?.length ?? 0}`);

    console.log("\n  Classes:");
    for (const cls of model.classes ?? []) {
      const abs  = cls.isAbstract ? " [abstract]" : "";
      const exts = cls.generalizations?.map(g => g.general).join(", ");
      console.log(`    • ${cls.name}${abs}${exts ? ` extends ${exts}` : ""}`);
    }

    const outPath = path.resolve(__dirname, "rent-a-car-pim-from-bus.json");
    fs.writeFileSync(outPath, JSON.stringify(model, null, 2), "utf-8");
    console.log(`\n  ✓ Written to: tests/rent-a-car-pim-from-bus.json`);
    console.log("=".repeat(60));
  });
}

main().catch(err => {
  console.error("[pim-subscriber] Error:", err);
  process.exit(1);
});
