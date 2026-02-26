/**
 * api-server.ts
 *
 * HTTP gateway for the BIG Modelling Bus pipeline.
 *
 * Accepts a DemoModel (CIM) as JSON via HTTP, validates it, and publishes it
 * as a retained MQTT artefact state on the bus. The downstream agents
 * (demo-to-pim-agent, pim-to-mendix-agent) then pick it up automatically.
 *
 * Endpoints:
 *   POST /api/model       Accept DemoModel JSON → publish to bus as model.demo.raw
 *   GET  /health          Health check (always 200 when server is running)
 *
 * Optional request headers (override per-request Mendix target):
 *   X-Mendix-App-Id       Mendix App UUID (overrides MENDIX_APP_ID env var)
 *   X-Mendix-Module-Name  Target module   (overrides MENDIX_MODULE_NAME env var)
 *   X-Mendix-Branch       Branch name     (overrides MENDIX_BRANCH env var)
 *
 * Environment variables:
 *   API_PORT              HTTP port (default: 3000)
 *   MQTT_BROKER           MQTT broker hostname (default: "localhost")
 *   MQTT_PORT             MQTT broker port     (default: 1883)
 *   MQTT_USER             MQTT username        (default: "admin")
 *   MQTT_PASSWORD         MQTT password        (default: "admin")
 *   BUS_PREFIX            Topic prefix         (default: "big")
 *   BUS_ENVIRONMENT_ID    Environment ID       (default: "dev")
 *   BUS_AGENT_ID          Agent ID             (default: "api-server")
 *
 * Example call:
 *   curl -X POST http://<pi-ip>:3000/api/model \
 *        -H "Content-Type: application/json" \
 *        -d @tests/rent-a-car-mock.json
 */

import express, { Request, Response } from "express";
import Ajv                             from "ajv";
import fs                              from "fs";
import path                            from "path";
import { BusClient }                   from "./bus-client";
import type { DemoModel }              from "./schemas/types";

// =============================================================================
// Configuration
// =============================================================================

const API_PORT   = parseInt(process.env.API_PORT ?? "3001", 10);
const ARTEFACT_ID = "model.demo.raw";

const config = {
  broker:        process.env.MQTT_BROKER         ?? "localhost",
  port:          parseInt(process.env.MQTT_PORT  ?? "1883", 10),
  user:          process.env.MQTT_USER           ?? "admin",
  password:      process.env.MQTT_PASSWORD       ?? "admin",
  prefix:        process.env.BUS_PREFIX          ?? "big",
  environmentID: process.env.BUS_ENVIRONMENT_ID  ?? "dev",
  agentID:       process.env.BUS_AGENT_ID        ?? "api-server",
  loadDelayMs:   100,
};

// =============================================================================
// JSON Schema validation (AJV, Draft-07)
// =============================================================================

const SCHEMAS_DIR = path.resolve(__dirname, "schemas");

const ajv         = new Ajv({ allErrors: true });
const demoSchema  = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, "demo-schema.json"), "utf-8"));
const validateDemo = ajv.compile(demoSchema);

// =============================================================================
// Express app
// =============================================================================

const app = express();
app.use(express.json({ limit: "10mb" }));

// ── POST /api/model ──────────────────────────────────────────────────────────

app.post("/api/model", (req: Request, res: Response) => {
  const payload = req.body as DemoModel;

  console.log(`[api-server] POST /api/model — received model "${(payload as any)?.name ?? "?"}`);

  // Validate against demo-schema.json
  if (!validateDemo(payload)) {
    const errors = validateDemo.errors
      ?.map(e => `  ${(e as any).dataPath || "/"} ${e.message}`)
      .join("\n") ?? "";
    console.error(`[api-server] ✗ Validation failed:\n${errors}`);
    res.status(400).json({
      ok:      false,
      error:   "Validation failed against demo-schema.json",
      details: validateDemo.errors?.map(e => ({
        path:    (e as any).dataPath || "/",
        message: e.message,
      })),
    });
    return;
  }

  // Attach optional per-request Mendix target from HTTP headers.
  // Injected AFTER schema validation so the extra field doesn't break AJV.
  // Downstream agents strip _target before their own validation.
  const appId      = req.headers["x-mendix-app-id"]      as string | undefined;
  const moduleName = req.headers["x-mendix-module-name"] as string | undefined;
  const branch     = req.headers["x-mendix-branch"]      as string | undefined;

  if (appId || moduleName || branch) {
    (payload as any)._target = {
      ...(appId      && { appId }),
      ...(moduleName && { moduleName }),
      ...(branch     && { branch }),
    };
    console.log(`[api-server]   _target: ${JSON.stringify((payload as any)._target)}`);
  }

  // Publish to bus — retained, so agents receive it even if they start later
  const timestamp = new Date().toISOString();
  bus.publishDemoState(ARTEFACT_ID, payload);

  console.log(`[api-server] ✓ Published "${(payload as any)?.name ?? "?"}" → ${ARTEFACT_ID} at ${timestamp}`);

  res.status(202).json({
    ok:          true,
    artefactID:  ARTEFACT_ID,
    timestamp,
    message:     "Model published to bus. Pipeline (demo→pim→mendix) will run asynchronously.",
  });
});

// ── GET /health ──────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status:  "ok",
    service: "api-server",
    broker:  `${config.broker}:${config.port}`,
  });
});

// ── 404 fallback ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found. Available: POST /api/model, GET /health" });
});

// =============================================================================
// Bus client (module-level so it survives across requests)
// =============================================================================

const bus = new BusClient(config);

// =============================================================================
// Startup
// =============================================================================

async function main(): Promise<void> {
  console.log("[api-server] Starting …");
  console.log(`[api-server] Connecting to MQTT broker ${config.broker}:${config.port} …`);

  try {
    await bus.connect();
    console.log("[api-server] ✓ Connected to MQTT broker");
  } catch (err) {
    console.error("[api-server] ✗ MQTT connection failed:", (err as Error).message);
    process.exit(1);
  }

  app.listen(API_PORT, "0.0.0.0", () => {
    console.log(`[api-server] ✓ Listening on port ${API_PORT}`);
    console.log(`[api-server]   POST /api/model  →  publishes DemoModel → ${ARTEFACT_ID}`);
    console.log(`[api-server]   GET  /health     →  health check`);
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error("[api-server] Unhandled error:", err);
    process.exit(1);
  });
}
