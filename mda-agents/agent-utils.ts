// Shared helpers used by all agents in the pipeline.

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";
import type { BusConfig } from "./bus-client";

// Metadata that travels with every message through the pipeline.
// Stripped before schema validation (additionalProperties: false), re-attached after.
export interface PipelineMeta {
  _source?: { format: string };  // which CIM language the model came from, e.g. "demo"
  _target?: {
    appId?:      string;         // Mendix app UUID
    moduleName?: string;
    branch?:     string;
  };
}

export function getBusConfig(agentId: string): BusConfig & { loadDelayMs: number } {
  return {
    broker:        process.env.MQTT_BROKER        ?? "localhost",
    port:          parseInt(process.env.MQTT_PORT ?? "1883", 10),
    user:          process.env.MQTT_USER          ?? "admin",
    password:      process.env.MQTT_PASSWORD      ?? "admin",
    prefix:        process.env.BUS_PREFIX         ?? "big",
    environmentID: process.env.BUS_ENVIRONMENT_ID ?? "dev",
    agentID:       process.env.BUS_AGENT_ID       ?? agentId,
    loadDelayMs:   300,
  };
}

const SCHEMAS_DIR = path.resolve(__dirname, "schemas");
const ajv = new Ajv({ allErrors: true });

export function makeValidator(filename: string): Ajv.ValidateFunction {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), "utf-8"));
  return ajv.compile(schema);
}

export function assertValid(validate: Ajv.ValidateFunction, data: unknown, label: string): void {
  if (!validate(data)) {
    const errors = validate.errors
      ?.map(e => `  ${(e as any).dataPath || "/"} ${e.message}`)
      .join("\n") ?? "";
    throw new Error(`[${label}] Validation failed:\n${errors}`);
  }
}

// Remove _source/_target before schema validation, return them separately.
export function extractMeta<T extends object>(payload: T): { clean: T; meta: PipelineMeta } {
  const raw   = payload as any;
  const meta: PipelineMeta = {};
  if (raw._source !== undefined) meta._source = raw._source;
  if (raw._target !== undefined) meta._target = raw._target;
  const clean = { ...payload } as any;
  delete clean._source;
  delete clean._target;
  return { clean: clean as T, meta };
}

// Re-attach _source/_target after validation.
export function attachMeta<T extends object>(payload: T, meta: PipelineMeta): T {
  if (meta._source !== undefined) (payload as any)._source = meta._source;
  if (meta._target !== undefined) (payload as any)._target = meta._target;
  return payload;
}
