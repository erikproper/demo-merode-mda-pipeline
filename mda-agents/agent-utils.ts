// Shared helpers used by all agents in the pipeline.

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";
import type { BusConfig } from "./bus-client";

// One trace entry documents a single transformation step.
export interface TraceEntry {
  sourceType: string;  // e.g. "EntityType", "FactType", "ObjectType"
  sourceName: string;  // e.g. "Rental", "RentalInvolvesCar"
  targetType: string;  // e.g. "Class", "Association", "NotMapped"
  targetName: string;  // e.g. "Rental", "RentalInvolvesCar"
}

// Metadata that travels with every message through the pipeline.
// Stripped before schema validation (additionalProperties: false), re-attached after.
export interface PipelineMeta {
  _source?: { format: string };  // which CIM language the model came from, e.g. "demo"
  _target?: {
    appId?:      string;         // Mendix app UUID
    moduleName?: string;
    branch?:     string;
  };
  _trace?: TraceEntry[];         // transformation trace for evaluation (RQ4)
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

// Remove _source/_target/_trace before schema validation, return them separately.
export function extractMeta<T extends object>(payload: T): { clean: T; meta: PipelineMeta } {
  const raw   = payload as any;
  const meta: PipelineMeta = {};
  if (raw._source !== undefined) meta._source = raw._source;
  if (raw._target !== undefined) meta._target = raw._target;
  if (raw._trace  !== undefined) meta._trace  = raw._trace;
  const clean = { ...payload } as any;
  delete clean._source;
  delete clean._target;
  delete clean._trace;
  return { clean: clean as T, meta };
}

// Re-attach _source/_target/_trace after validation.
export function attachMeta<T extends object>(payload: T, meta: PipelineMeta): T {
  if (meta._source !== undefined) (payload as any)._source = meta._source;
  if (meta._target !== undefined) (payload as any)._target = meta._target;
  if (meta._trace  !== undefined) (payload as any)._trace  = meta._trace;
  return payload;
}
