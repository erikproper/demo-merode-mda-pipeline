// Reads rent-a-car-mock.json and publishes it as a DemoModel on the bus.
// Used for local testing without an HTTP request.
//
// Run:  npx ts-node demo-publisher.ts

import path from "path";
import fs   from "fs";
import { BusClient } from "./bus-client";
import type { DemoModel } from "./schemas/types";
import { getBusConfig } from "./agent-utils";

const config      = getBusConfig("demo-publisher");
const ARTEFACT_ID = "model.demo.raw";

async function main() {
  const mockPath = path.resolve(__dirname, "tests", "rent-a-car-mock.json");

  if (!fs.existsSync(mockPath)) {
    console.error(`[demo-publisher] file not found: ${mockPath}`);
    process.exit(1);
  }

  const model = JSON.parse(fs.readFileSync(mockPath, "utf-8")) as DemoModel;
  console.log(`[demo-publisher] loaded "${model.name}" (${model.entityTypes.length} entity types)`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[demo-publisher] connected to ${config.broker}:${config.port}`);

  bus.publishDemoState(ARTEFACT_ID, model);
  console.log(`[demo-publisher] published to "${ARTEFACT_ID}"`);

  await bus.disconnect();
  console.log("[demo-publisher] done");
}

main().catch(err => {
  console.error("[demo-publisher] error:", err);
  process.exit(1);
});
