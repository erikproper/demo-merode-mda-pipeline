// HTTP gateway for the MDA pipeline.
//
// Accepts any CIM model as JSON and routes it onto the bus.
// Format-specific validation happens inside each CIM agent.
//
// Endpoints:
//   POST /api/model  - submit a CIM model
//   GET  /health     - liveness check
//
// Required headers:
//   X-Input-Format        format of the input model: "demo" | "merode"
//
// Optional headers:
//   X-Mendix-App-Id       target Mendix app UUID
//   X-Mendix-Module-Name  target module in Mendix
//   X-Mendix-Branch       target branch, default "main"

import express, { Request, Response } from "express";
import { BusClient }  from "./bus-client";
import { getBusConfig, attachMeta } from "./agent-utils";

const PORT        = parseInt(process.env.API_PORT ?? "3001", 10);
const ARTEFACT_ID = "model.cim.raw";

// Add new formats here when a new CIM agent is added.
const SUPPORTED_FORMATS = ["demo", "merode"];

const busConfig = getBusConfig("api-server");
const bus       = new BusClient(busConfig);
const app       = express();
app.use(express.json({ limit: "10mb" }));

app.post("/api/model", (req: Request, res: Response) => {
  const payload = req.body;
  const format  = ((req.headers["x-input-format"] as string) ?? "").toLowerCase();

  if (!format) {
    res.status(400).json({ ok: false, error: `Missing header: X-Input-Format. Supported: ${SUPPORTED_FORMATS.join(", ")}` });
    return;
  }
  if (!SUPPORTED_FORMATS.includes(format)) {
    res.status(400).json({ ok: false, error: `Unknown format "${format}". Supported: ${SUPPORTED_FORMATS.join(", ")}` });
    return;
  }
  if (!payload || typeof payload !== "object" || typeof (payload as any).name !== "string") {
    res.status(400).json({ ok: false, error: "Body must be a JSON object with a 'name' field" });
    return;
  }

  const h = req.headers;
  const target: Record<string, string> = {};
  if (h["x-mendix-app-id"])      target.appId      = h["x-mendix-app-id"]      as string;
  if (h["x-mendix-module-name"]) target.moduleName = h["x-mendix-module-name"] as string;
  if (h["x-mendix-branch"])      target.branch     = h["x-mendix-branch"]      as string;

  const enriched = attachMeta(payload as object, {
    _source: { format },
    _target: Object.keys(target).length > 0 ? target : undefined,
  });

  const timestamp = new Date().toISOString();
  bus.publishCimState(ARTEFACT_ID, enriched);
  console.log(`[api] published "${(payload as any).name}" (format: ${format}) to ${ARTEFACT_ID}`);

  res.status(202).json({
    ok:        true,
    format,
    artefactID: ARTEFACT_ID,
    timestamp,
    message:   "Model accepted. Processing in the background.",
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
  app.listen(PORT, "0.0.0.0", () => console.log(`[api] listening on port ${PORT}`));
}

if (require.main === module) {
  main().catch(err => {
    console.error("[api] startup failed:", err);
    process.exit(1);
  });
}
