// Shared helpers used by all pipeline agents.
// Keeps the individual agent files focused on their transformation logic.

import path from "path";
import fs   from "fs";
import Ajv  from "ajv";
import type { BusConfig } from "./bus-client";

// Routing metadata that travels with every message through the pipeline.
// _source tells downstream agents what format the input was (e.g. "demo").
// _target carries optional Mendix connection details set by the HTTP caller.
//
// Both fields are stripped before JSON schema validation (schemas use
// additionalProperties: false) and re-attached afterwards.
export interface PipelineMeta {
  _source?: { format: string };
  _target?: {
    system?:     string;  // future use — output system, e.g. "mendix"
    appId?:      string;
    moduleName?: string;
    branch?:     string;
  };
}

// Build MQTT config from environment variables.
// The agentId is used as the MQTT client identifier unless BUS_AGENT_ID is set.
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

// Load a JSON schema file and compile it into a reusable validator.
export function makeValidator(filename: string): Ajv.ValidateFunction {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), "utf-8"));
  return ajv.compile(schema);
}

// Run validation and throw a readable error listing all failures.
export function assertValid(validate: Ajv.ValidateFunction, data: unknown, label: string): void {
  if (!validate(data)) {
    const errors = validate.errors
      ?.map(e => `  ${(e as any).dataPath || "/"} ${e.message}`)
      .join("\n") ?? "";
    throw new Error(`[${label}] Validation failed:\n${errors}`);
  }
}

// Strip _source and _target from a payload so it passes schema validation.
// Returns both the cleaned payload and the extracted metadata separately.
export function extractMeta<T extends object>(payload: T): { clean: T; meta: PipelineMeta } {
  const raw = payload as any;
  const meta: PipelineMeta = {};

  if (raw._source !== undefined) meta._source = raw._source;
  if (raw._target !== undefined) meta._target = raw._target;

  const clean = { ...payload } as any;
  delete clean._source;
  delete clean._target;

  return { clean: clean as T, meta };
}

// Re-attach _source and _target to a payload after validation.
export function attachMeta<T extends object>(payload: T, meta: PipelineMeta): T {
  if (meta._source !== undefined) (payload as any)._source = meta._source;
  if (meta._target !== undefined) (payload as any)._target = meta._target;
  return payload;
}
