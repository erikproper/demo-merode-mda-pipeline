/**
 * demo-publisher.ts
 *
 * Reads rent-a-car-mock.json and publishes it as a DemoModel artefact state
 * on the BIG Modelling Bus with artefactID "model.demo.raw".
 *
 * Full MQTT topic published:
 *   {prefix}/bus-version-1.0/{environmentID}/{agentID}/artefacts/json/model.demo.raw/demo-v1.0-v1.0/state
 *
 * Configuration via environment variables (or hardcoded defaults for local dev):
 *   MQTT_BROKER         – broker hostname       (default: "localhost")
 *   MQTT_PORT           – broker port           (default: 1883)
 *   MQTT_USER           – MQTT username         (default: "admin")
 *   MQTT_PASSWORD       – MQTT password         (default: "admin")
 *   BUS_PREFIX          – topic prefix          (default: "big")
 *   BUS_ENVIRONMENT_ID  – environment ID        (default: "dev")
 *   BUS_AGENT_ID        – agent ID              (default: "demo-publisher")
 *
 * Run:
 *   npx ts-node demo-publisher.ts
 */

import path from "path";
import fs   from "fs";
import { BusClient, DEMO_JSON_VERSION } from "./bus-client";
import type { DemoModel } from "./schemas/types";

// ---------------------------------------------------------------------------
// Configuration (environment variables with local-dev defaults)
// ---------------------------------------------------------------------------

const config = {
  broker:        process.env.MQTT_BROKER        ?? "localhost",
  port:          parseInt(process.env.MQTT_PORT ?? "1883", 10),
  user:          process.env.MQTT_USER          ?? "admin",
  password:      process.env.MQTT_PASSWORD      ?? "admin",
  prefix:        process.env.BUS_PREFIX         ?? "big",
  environmentID: process.env.BUS_ENVIRONMENT_ID ?? "dev",
  agentID:       process.env.BUS_AGENT_ID       ?? "demo-publisher",
  loadDelayMs:   300,
};

// ---------------------------------------------------------------------------
// Artefact identifier
// The bus publishes to: artefacts/json/<artefactID>/demo-v1.0-v1.0/state
// ---------------------------------------------------------------------------

const ARTEFACT_ID = "model.demo.raw";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Load mock JSON from disk
  const mockPath = path.resolve(__dirname, "tests", "rent-a-car-mock.json");

  if (!fs.existsSync(mockPath)) {
    console.error(`[demo-publisher] File not found: ${mockPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(mockPath, "utf-8");
  const model: DemoModel = JSON.parse(raw) as DemoModel;

  console.log(`[demo-publisher] Loaded: ${mockPath}`);
  console.log(`[demo-publisher] Model name: "${model.name}"`);
  console.log(`[demo-publisher] Entity types: ${model.entityTypes.length}`);

  // 2. Connect to the bus
  const bus = new BusClient(config);

  const fullTopic =
    `${config.prefix}/bus-version-1.0/${config.environmentID}/${config.agentID}` +
    `/artefacts/json/${ARTEFACT_ID}/${DEMO_JSON_VERSION}/state`;

  console.log(`[demo-publisher] Connecting to ${config.broker}:${config.port} …`);

  try {
    await bus.connect();
    console.log(`[demo-publisher] Connected.`);
  } catch (err) {
    console.error(`[demo-publisher] Connection failed:`, err);
    process.exit(1);
  }

  // 3. Publish the DemoModel as the authoritative artefact state
  //    publishDemoState → publishArtefactState → retained StreamedEvent
  bus.publishDemoState(ARTEFACT_ID, model);

  console.log(`[demo-publisher] Published DemoModel to topic:`);
  console.log(`  ${fullTopic}`);
  console.log(`[demo-publisher] Artefact ID : ${ARTEFACT_ID}`);
  console.log(`[demo-publisher] JSON version: ${DEMO_JSON_VERSION}`);

  // 4. Disconnect cleanly
  await bus.disconnect();
  console.log(`[demo-publisher] Done.`);
}

main().catch((err) => {
  console.error("[demo-publisher] Unhandled error:", err);
  process.exit(1);
});
