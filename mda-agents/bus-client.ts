// TypeScript client for the BIG Modelling Bus (mirrors Go bus layers 1–3).
//
// The bus uses MQTT as transport. Every agent has its own topic namespace:
//   {prefix}/bus-version-1.0/{environmentID}/{agentID}/{path}
//
// Artefacts (models) are published as retained messages so agents that
// start late still receive the last known state.
//
// Go agents store large payloads on FTP and only post a link (RepositoryEvent).
// TypeScript agents embed the JSON directly (StreamedEvent). Both formats
// are handled transparently on the subscribe side.

import mqtt, { MqttClient, IClientOptions } from "mqtt";
import type { DemoModel, PimModel } from "./schemas/types";

const BUS_VERSION = "bus-version-1.0";

export const CIM_JSON_VERSION    = "cim-v1.0-v1.0";
export const DEMO_JSON_VERSION   = "demo-v1.0-v1.0";
export const PIMUML_JSON_VERSION = "pimuml-v1.0-v1.0";

export interface BusConfig {
  broker:        string;
  port?:         number;
  user:          string;
  password:      string;
  prefix:        string;
  environmentID: string;
  agentID:       string;
  loadDelayMs?:  number;  // wait after connect for retained messages to arrive
}

// Wire formats used on the MQTT bus.
// StreamedEvent: used by TypeScript agents (payload embedded directly).
// RepositoryEvent: used by Go agents (payload stored on FTP, only a link posted).
interface StreamedEvent   { timestamp: string; payload: unknown }
interface RepositoryEvent { timestamp: string; "file path"?: string; server?: string; port?: string }

function isStreamedEvent(obj: unknown): obj is StreamedEvent {
  return typeof obj === "object" && obj !== null && "timestamp" in obj && "payload" in obj;
}
function isRepositoryEvent(obj: unknown): obj is RepositoryEvent {
  return typeof obj === "object" && obj !== null && "timestamp" in obj && ("file path" in obj || "server" in obj);
}

// Tracks the last published state per artefact (mirrors TModellingBusArtefactConnector).
interface ArtefactState<T> {
  current:             T | null;
  currentTimestamp:    string;
  updated:             T | null;
  updatedTimestamp:    string;
  considered:          T | null;
  consideredTimestamp: string;
  stateCommunicated:   boolean;
}

function makeArtefactState<T>(): ArtefactState<T> {
  const ts = new Date().toISOString();
  return {
    current: null, currentTimestamp: ts,
    updated: null, updatedTimestamp: ts,
    considered: null, consideredTimestamp: ts,
    stateCommunicated: false,
  };
}

function now() { return new Date().toISOString(); }

export class BusClient {
  private readonly cfg: Required<BusConfig>;
  private client!: MqttClient;
  private readonly artefactStates = new Map<string, ArtefactState<unknown>>();

  constructor(config: BusConfig) {
    this.cfg = { port: 1883, loadDelayMs: 500, ...config };
  }

  // Connect to the broker and wait briefly for retained messages to arrive.
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts: IClientOptions = { username: this.cfg.user, password: this.cfg.password, clean: true };
      this.client = mqtt.connect(`tcp://${this.cfg.broker}:${this.cfg.port}`, opts);
      this.client.once("connect", () => setTimeout(resolve, this.cfg.loadDelayMs));
      this.client.once("error", reject);
    });
  }

  disconnect(): Promise<void> {
    return new Promise(resolve => this.client.end(false, {}, () => resolve()));
  }

  // Full MQTT topic for a given agent and relative path.
  // Pattern mirrors mqttAgentTopicPath() in layer_1_events_connector.go.
  private topicFor(agentID: string, path: string) {
    return `${this.cfg.prefix}/${BUS_VERSION}/${this.cfg.environmentID}/${agentID}/${path}`;
  }

  private statePath(id: string, ver: string)       { return `artefacts/json/${id}/${ver}/state`; }
  private updatePath(id: string, ver: string)       { return `artefacts/json/${id}/${ver}/update`; }
  private consideringPath(id: string, ver: string)  { return `artefacts/json/${id}/${ver}/considering`; }
  private coordPath(id: string)                     { return `coordination/${id}`; }

  // Publish a StreamedEvent on the given agent's topic (retained by default).
  private publishStreamed(agentID: string, path: string, payload: unknown, retain = true) {
    const event: StreamedEvent = { timestamp: now(), payload };
    this.client.publish(this.topicFor(agentID, path), JSON.stringify(event), { retain, qos: 0 });
  }

  // Delete a retained message by publishing an empty payload.
  private deletePosting(path: string) {
    this.client.publish(this.topicFor(this.cfg.agentID, path), Buffer.alloc(0), { retain: true, qos: 0 });
  }

  // Subscribe to a topic and forward decoded payloads to the handler.
  // Skips empty payloads (deletion signals) and non-JSON messages.
  private subscribeRaw(
    agentID: string,
    path:    string,
    handler: (payload: unknown, timestamp: string, isRepoEvent: boolean) => void,
  ) {
    const topic = this.topicFor(agentID, path);
    this.client.subscribe(topic, { qos: 0 });

    this.client.on("message", (receivedTopic: string, message: Buffer) => {
      if (receivedTopic !== topic || message.length === 0) return;
      let parsed: unknown;
      try { parsed = JSON.parse(message.toString()); } catch { return; }

      if (isStreamedEvent(parsed))        handler(parsed.payload, parsed.timestamp, false);
      else if (isRepositoryEvent(parsed)) handler(parsed, parsed.timestamp, true);
    });
  }

  private artefactStateFor<T>(artefactID: string, jsonVersion: string): ArtefactState<T> {
    const key = `${artefactID}/${jsonVersion}`;
    if (!this.artefactStates.has(key)) this.artefactStates.set(key, makeArtefactState<T>());
    return this.artefactStates.get(key) as ArtefactState<T>;
  }

  // Publish the authoritative state of an artefact (retained).
  // Mirrors PostJSONArtefactState in layer_3_artefacts.go.
  publishArtefactState<T>(artefactID: string, jsonVersion: string, model: T) {
    const s = this.artefactStateFor<T>(artefactID, jsonVersion);
    const ts = now();
    s.current = s.updated = s.considered = model;
    s.currentTimestamp = s.updatedTimestamp = s.consideredTimestamp = ts;
    s.stateCommunicated = true;
    this.publishStreamed(this.cfg.agentID, this.statePath(artefactID, jsonVersion), model, true);
  }

  // Publish a non-breaking change to an existing artefact state.
  // Mirrors PostJSONArtefactUpdate in layer_3_artefacts.go.
  // Note: Go sends an RFC 6902 JSON Patch via FTP; we embed the full model directly.
  publishArtefactUpdate<T>(artefactID: string, jsonVersion: string, model: T) {
    const s = this.artefactStateFor<T>(artefactID, jsonVersion);
    if (!s.stateCommunicated) { this.publishArtefactState(artefactID, jsonVersion, model); return; }
    const ts = now();
    s.updated = s.considered = model;
    s.updatedTimestamp = s.consideredTimestamp = ts;
    this.publishStreamed(this.cfg.agentID, this.updatePath(artefactID, jsonVersion), model, true);
  }

  // Publish a speculative (not-yet-committed) change.
  // Mirrors PostJSONArtefactConsidering in layer_3_artefacts.go.
  publishArtefactConsidering<T>(artefactID: string, jsonVersion: string, model: T) {
    const s = this.artefactStateFor<T>(artefactID, jsonVersion);
    if (!s.stateCommunicated) { this.publishArtefactState(artefactID, jsonVersion, model); return; }
    s.considered = model;
    s.consideredTimestamp = now();
    this.publishStreamed(this.cfg.agentID, this.consideringPath(artefactID, jsonVersion), model, true);
  }

  // Remove all retained messages for an artefact.
  deleteArtefact(artefactID: string, jsonVersion: string) {
    this.deletePosting(this.statePath(artefactID, jsonVersion));
    this.deletePosting(this.updatePath(artefactID, jsonVersion));
    this.deletePosting(this.consideringPath(artefactID, jsonVersion));
    this.artefactStates.delete(`${artefactID}/${jsonVersion}`);
  }

  // Subscribe to artefact state postings from another agent.
  // Go agents post RepositoryEvents (FTP links) which TypeScript cannot fetch -
  // those are logged and skipped. Mirrors ListenForJSONArtefactStatePostings.
  subscribeArtefactState<T>(
    fromAgentID: string,
    artefactID:  string,
    jsonVersion:  string,
    handler: (model: T, timestamp: string) => void,
  ) {
    this.subscribeRaw(fromAgentID, this.statePath(artefactID, jsonVersion), (payload, ts, isRepo) => {
      if (isRepo) {
        console.warn(`[bus] subscribeArtefactState(${artefactID}): FTP event from "${fromAgentID}" - skipped (not supported in TypeScript)`);
        return;
      }
      handler(payload as T, ts);
    });
  }

  subscribeArtefactUpdate<T>(
    fromAgentID: string,
    artefactID:  string,
    jsonVersion:  string,
    handler: (model: T, timestamp: string) => void,
  ) {
    this.subscribeRaw(fromAgentID, this.updatePath(artefactID, jsonVersion), (payload, ts, isRepo) => {
      if (isRepo) { console.warn(`[bus] subscribeArtefactUpdate(${artefactID}): FTP event - skipped`); return; }
      handler(payload as T, ts);
    });
  }

  subscribeArtefactConsidering<T>(
    fromAgentID: string,
    artefactID:  string,
    jsonVersion:  string,
    handler: (model: T, timestamp: string) => void,
  ) {
    this.subscribeRaw(fromAgentID, this.consideringPath(artefactID, jsonVersion), (payload, ts, isRepo) => {
      if (isRepo) { console.warn(`[bus] subscribeArtefactConsidering(${artefactID}): FTP event - skipped`); return; }
      handler(payload as T, ts);
    });
  }

  // Coordination messages are not retained (fire-and-forget).
  publishCoordination(toAgentID: string, coordinationID: string, payload: unknown) {
    const event: StreamedEvent = { timestamp: now(), payload };
    this.client.publish(this.topicFor(toAgentID, this.coordPath(coordinationID)), JSON.stringify(event), { retain: false, qos: 0 });
  }

  subscribeCoordination(coordinationID: string, handler: (payload: unknown, timestamp: string) => void) {
    this.subscribeRaw(this.cfg.agentID, this.coordPath(coordinationID), (payload, ts) => handler(payload, ts));
  }

  // Generic CIM input - all input formats share one topic; agents filter by _source.format.
  publishCimState(artefactID: string, model: object) { this.publishArtefactState(artefactID, CIM_JSON_VERSION, model); }
  subscribeCimState<T>(fromAgentID: string, artefactID: string, handler: (model: T, ts: string) => void) {
    this.subscribeArtefactState<T>(fromAgentID, artefactID, CIM_JSON_VERSION, handler);
  }

  // Typed shortcuts for DemoModel and PimModel.
  publishDemoState(artefactID: string, model: DemoModel)      { this.publishArtefactState(artefactID, DEMO_JSON_VERSION, model); }
  publishDemoUpdate(artefactID: string, model: DemoModel)     { this.publishArtefactUpdate(artefactID, DEMO_JSON_VERSION, model); }
  publishDemoConsidering(artefactID: string, model: DemoModel){ this.publishArtefactConsidering(artefactID, DEMO_JSON_VERSION, model); }

  subscribeDemoState(fromAgentID: string, artefactID: string, handler: (model: DemoModel, ts: string) => void) {
    this.subscribeArtefactState<DemoModel>(fromAgentID, artefactID, DEMO_JSON_VERSION, handler);
  }
  subscribeDemoUpdate(fromAgentID: string, artefactID: string, handler: (model: DemoModel, ts: string) => void) {
    this.subscribeArtefactUpdate<DemoModel>(fromAgentID, artefactID, DEMO_JSON_VERSION, handler);
  }

  publishPimState(artefactID: string, model: PimModel)       { this.publishArtefactState(artefactID, PIMUML_JSON_VERSION, model); }
  publishPimUpdate(artefactID: string, model: PimModel)      { this.publishArtefactUpdate(artefactID, PIMUML_JSON_VERSION, model); }
  publishPimConsidering(artefactID: string, model: PimModel) { this.publishArtefactConsidering(artefactID, PIMUML_JSON_VERSION, model); }

  subscribePimState(fromAgentID: string, artefactID: string, handler: (model: PimModel, ts: string) => void) {
    this.subscribeArtefactState<PimModel>(fromAgentID, artefactID, PIMUML_JSON_VERSION, handler);
  }
  subscribePimUpdate(fromAgentID: string, artefactID: string, handler: (model: PimModel, ts: string) => void) {
    this.subscribeArtefactUpdate<PimModel>(fromAgentID, artefactID, PIMUML_JSON_VERSION, handler);
  }
}
