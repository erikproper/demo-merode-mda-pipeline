// HTTP entry point for the MDA pipeline.
//
// Accepts a DEMO model as JSON, validates it against the schema, and
// publishes it to the MQTT bus so the downstream agents pick it up.
//
// Endpoints:
//   POST /api/model  — submit a DEMO model
//   GET  /health     — check if the server is running
//
// Optional request headers (all override the env var defaults):
//   X-Input-Format        input format, default "demo"
//   X-Mendix-App-Id       Mendix app UUID
//   X-Mendix-Module-Name  target module in Mendix
//   X-Mendix-Branch       branch name, default "main"
//   X-Output-Target       output system (future use)
//
// Example:
//   curl -X POST http://localhost:3001/api/model \
//        -H "Content-Type: application/json" \
//        -d @rent-a-car.json

import express, { Request, Response } from "express";
import { BusClient }    from "./bus-client";
import type { DemoModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, attachMeta } from "./agent-utils";

const PORT        = parseInt(process.env.API_PORT ?? "3001", 10);
const ARTEFACT_ID = "model.demo.raw";

const busConfig    = getBusConfig("api-server");
const bus          = new BusClient(busConfig);
const validateDemo = makeValidator("demo-schema.json");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/api/model", (req: Request, res: Response) => {
  const payload = req.body as DemoModel;
  console.log(`[api] received "${(payload as any)?.name ?? "?"}"`);

  // Validate before adding any extra fields — the schema rejects unknown properties.
  try {
    assertValid(validateDemo, payload, "demo-schema.json");
  } catch (err) {
    console.error("[api] invalid payload:", (err as Error).message);
    res.status(400).json({ ok: false, error: (err as Error).message });
    return;
  }

  // Read routing info from HTTP headers and attach it to the payload.
  // This happens after validation so the extra fields don't break the schema check.
  const h = req.headers;
  const target: Record<string, string> = {};
  if (h["x-mendix-app-id"])       target.appId      = h["x-mendix-app-id"]       as string;
  if (h["x-mendix-module-name"])  target.moduleName = h["x-mendix-module-name"]  as string;
  if (h["x-mendix-branch"])       target.branch     = h["x-mendix-branch"]       as string;
  if (h["x-output-target"])       target.system     = h["x-output-target"]       as string;

  const enriched = attachMeta({ ...payload } as DemoModel, {
    _source: { format: (h["x-input-format"] as string) ?? "demo" },
    _target: Object.keys(target).length > 0 ? target : undefined,
  });

  const timestamp = new Date().toISOString();
  bus.publishDemoState(ARTEFACT_ID, enriched);
  console.log(`[api] published to ${ARTEFACT_ID} at ${timestamp}`);

  res.status(202).json({
    ok:        true,
    artefactID: ARTEFACT_ID,
    timestamp,
    message:   "Model received. The pipeline will run in the background.",
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", broker: `${busConfig.broker}:${busConfig.port}` });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found. Available: POST /api/model, GET /health" });
});

async function main() {
  await bus.connect();
  console.log(`[api] connected to MQTT at ${busConfig.broker}:${busConfig.port}`);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[api] listening on port ${PORT}`);
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error("[api] startup failed:", err);
    process.exit(1);
  });
}
