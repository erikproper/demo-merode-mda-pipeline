/**
 * BIG Modelling Bus — TypeScript Client
 *
 * TypeScript mirror of the Go bus layers 1–3 (connect package).
 * Uses MQTT for event transport via the `mqtt` (MQTT.js) package.
 *
 * Architecture mapping (Go → TypeScript):
 *   Layer 1 – Events Connector      → MqttClient + topic helpers
 *   Layer 2 – Basic Modelling Bus   → BusClient (publish/subscribe core)
 *   Layer 3 – Artefacts             → publishArtefact* / subscribeArtefact*
 *   Layer 3 – Coordination          → publishCoordination / subscribeCoordination
 *
 * Topic structure (exact match with Go bus):
 *   {prefix}/bus-version-1.0/{environmentID}/{agentID}/{topicPath}
 *
 * Artefact topic paths (mirrors layer_3_artefacts.go constants):
 *   artefacts/json/{artefactID}/{jsonVersion}/state
 *   artefacts/json/{artefactID}/{jsonVersion}/update
 *   artefacts/json/{artefactID}/{jsonVersion}/considering
 *
 * Coordination topic path (mirrors layer_3_coordination.go):
 *   coordination/{coordinationID}
 *
 * Publishing strategy:
 *   Go agents store artefact JSON on FTP and post only a link (RepositoryEvent)
 *   to MQTT. TypeScript agents cannot access FTP, so they embed the JSON directly
 *   in the MQTT payload using the streamed format (StreamedEvent). Subscribing
 *   handles both wire formats transparently and warns when an FTP link arrives.
 *
 * Dependencies (add to package.json):
 *   "mqtt": "^5.x"          — MQTT.js client
 *
 * Usage example:
 *   const bus = new BusClient({ broker: "localhost", port: 1883,
 *     user: "u", password: "p", prefix: "big",
 *     environmentID: "exp-01", agentID: "demo-transformer" });
 *   await bus.connect();
 *
 *   bus.subscribeDemoState("modelling-frontend", "demo-model-1",
 *     (model, ts) => { ... });
 *
 *   bus.publishPimState("pim-model-1", pimModel);
 */

import mqtt, { MqttClient, IClientOptions } from "mqtt";
import type { DemoModel, PimModel } from "./schemas/types";

// =============================================================================
// Constants (mirrors generics/constants.go and layer_3_artefacts.go)
// =============================================================================

const BUS_VERSION = "bus-version-1.0";

/** Well-known JSON version identifiers for the typed model artefacts. */
export const DEMO_JSON_VERSION   = "demo-v1.0-v1.0";
export const PIMUML_JSON_VERSION = "pimuml-v1.0-v1.0";

// Topic path elements
const ARTEFACTS_JSON_PATH         = "artefacts/json";
const COORDINATION_PATH           = "coordination";
const ARTEFACT_STATE_SUFFIX       = "state";
const ARTEFACT_UPDATE_SUFFIX      = "update";
const ARTEFACT_CONSIDERING_SUFFIX = "considering";

// =============================================================================
// Configuration
// =============================================================================

/**
 * MQTT connection configuration.
 * Keys mirror the Go config file sections: [mqtt] and root-level keys.
 */
export interface BusConfig {
  /** MQTT broker hostname (mqtt.broker). */
  broker: string;
  /** MQTT broker port (mqtt.port). Default: 1883. */
  port?: number;
  /** MQTT username (mqtt.user). */
  user: string;
  /** MQTT password (mqtt.password). */
  password: string;
  /** MQTT topic prefix (mqtt.prefix). */
  prefix: string;
  /** Modelling environment ID (environment). */
  environmentID: string;
  /** Agent ID for this client (agent). */
  agentID: string;
  /**
   * Milliseconds to wait after connecting before resolving, allowing retained
   * messages to arrive (mirrors mqtt.load_delay × 1000 in Go). Default: 500.
   */
  loadDelayMs?: number;
}

// =============================================================================
// Wire format types (mirrors Go bus internal structs)
// =============================================================================

/**
 * Streamed event wire format.
 * Mirrors tStreamedEvent in layer_2_basic_modelling_bus.go.
 * Used by: TypeScript agents (all artefacts), Go agents (coordination).
 */
interface StreamedEvent {
  timestamp: string;
  payload: unknown;
}

/**
 * Repository event wire format.
 * Mirrors tRepositoryEvent in layer_1_repository_connector.go.
 * Used by: Go agents (artefact state/update/considering).
 * TypeScript clients cannot fetch the FTP file referenced here.
 */
interface RepositoryEvent {
  timestamp: string;
  "file path"?: string;
  server?: string;
  port?: string;
}

// =============================================================================
// Internal artefact state tracker
// Mirrors TModellingBusArtefactConnector fields in layer_3_artefacts.go.
// =============================================================================

interface ArtefactState<T> {
  current:             T | null;
  currentTimestamp:    string;
  updated:             T | null;
  updatedTimestamp:    string;
  considered:          T | null;
  consideredTimestamp: string;
  /** Whether PostJSONArtefactState has been called at least once. */
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

// =============================================================================
// Helpers
// =============================================================================

function now(): string {
  return new Date().toISOString();
}

function isRepositoryEvent(obj: unknown): obj is RepositoryEvent {
  return (
    typeof obj === "object" && obj !== null &&
    "timestamp" in obj &&
    ("file path" in obj || "server" in obj)
  );
}

function isStreamedEvent(obj: unknown): obj is StreamedEvent {
  return (
    typeof obj === "object" && obj !== null &&
    "timestamp" in obj &&
    "payload" in obj
  );
}

// =============================================================================
// BusClient
// =============================================================================

/**
 * TypeScript client for the BIG Modelling Bus.
 *
 * Mirrors the public API of the Go bus at layers 2 and 3:
 *   - Artefact publish/subscribe (state, update, considering)
 *   - Coordination publish/subscribe
 *   - Typed convenience methods for DemoModel and PimModel
 */
export class BusClient {
  private readonly cfg: Required<BusConfig>;
  private client!: MqttClient;
  private readonly artefactStates = new Map<string, ArtefactState<unknown>>();

  constructor(config: BusConfig) {
    this.cfg = { port: 1883, loadDelayMs: 500, ...config };
  }

  // ---------------------------------------------------------------------------
  // Connection (mirrors createModellingBusEventsConnector → connectToMQTT)
  // ---------------------------------------------------------------------------

  /**
   * Connect to the MQTT broker and wait for retained messages.
   * Must be called before any publish or subscribe operation.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts: IClientOptions = {
        username: this.cfg.user,
        password: this.cfg.password,
        clean:    true,
      };

      this.client = mqtt.connect(
        `tcp://${this.cfg.broker}:${this.cfg.port}`,
        opts,
      );

      this.client.once("connect", () => {
        // Mirror loadDelay: wait for retained messages to arrive before resolving.
        setTimeout(resolve, this.cfg.loadDelayMs);
      });

      this.client.once("error", (err) => reject(err));
    });
  }

  /** Gracefully disconnect from the MQTT broker. */
  disconnect(): Promise<void> {
    return new Promise((resolve) => this.client.end(false, {}, () => resolve()));
  }

  // ---------------------------------------------------------------------------
  // Topic path construction
  // Mirrors mqttAgentTopicPath in layer_1_events_connector.go.
  // ---------------------------------------------------------------------------

  /**
   * Full MQTT topic for a given agentID and relative path segment.
   * Pattern: {prefix}/bus-version-1.0/{environmentID}/{agentID}/{path}
   */
  private topicFor(agentID: string, path: string): string {
    return `${this.cfg.prefix}/${BUS_VERSION}/${this.cfg.environmentID}/${agentID}/${path}`;
  }

  // Relative topic paths for artefacts (mirrors layer_3_artefacts.go helpers).
  private statePath(artefactID: string, jsonVersion: string): string {
    return `${ARTEFACTS_JSON_PATH}/${artefactID}/${jsonVersion}/${ARTEFACT_STATE_SUFFIX}`;
  }

  private updatePath(artefactID: string, jsonVersion: string): string {
    return `${ARTEFACTS_JSON_PATH}/${artefactID}/${jsonVersion}/${ARTEFACT_UPDATE_SUFFIX}`;
  }

  private consideringPath(artefactID: string, jsonVersion: string): string {
    return `${ARTEFACTS_JSON_PATH}/${artefactID}/${jsonVersion}/${ARTEFACT_CONSIDERING_SUFFIX}`;
  }

  private coordPath(coordinationID: string): string {
    return `${COORDINATION_PATH}/${coordinationID}`;
  }

  // ---------------------------------------------------------------------------
  // Low-level publish (mirrors postEvent / postJSONAsStreamed)
  // ---------------------------------------------------------------------------

  /**
   * Publish a value as a StreamedEvent on the given agent's topic.
   * Uses retained=true for artefacts so late subscribers receive the last state.
   * Mirrors postJSONAsStreamed (Layer 2), but without FTP indirection.
   */
  private publishStreamed(
    agentID: string,
    path: string,
    payload: unknown,
    retain = true,
  ): void {
    const event: StreamedEvent = { timestamp: now(), payload };
    this.client.publish(
      this.topicFor(agentID, path),
      JSON.stringify(event),
      { retain, qos: 0 },
    );
  }

  /**
   * Delete a posting by publishing an empty payload (mirrors deletePostingPath).
   * The MQTT broker removes the retained message when payload is empty.
   */
  private deletePosting(path: string): void {
    this.client.publish(
      this.topicFor(this.cfg.agentID, path),
      Buffer.alloc(0),
      { retain: true, qos: 0 },
    );
  }

  // ---------------------------------------------------------------------------
  // Low-level subscribe (mirrors listenForEvents / listenForStreamedPostings)
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to an agent's topic and invoke the handler with the decoded payload.
   * Handles both StreamedEvent (TypeScript / coordination) and RepositoryEvent
   * (Go file-based artefacts). Empty payloads (deletion signals) are ignored.
   *
   * Mirrors listenForEvents in layer_1_events_connector.go.
   */
  private subscribeRaw(
    agentID: string,
    path: string,
    handler: (payload: unknown, timestamp: string, isRepoEvent: boolean) => void,
  ): void {
    const topic = this.topicFor(agentID, path);
    this.client.subscribe(topic, { qos: 0 });

    this.client.on("message", (receivedTopic: string, message: Buffer) => {
      if (receivedTopic !== topic || message.length === 0) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(message.toString());
      } catch {
        return; // ignore non-JSON payloads
      }

      if (isStreamedEvent(parsed)) {
        handler(parsed.payload, parsed.timestamp, false);
      } else if (isRepositoryEvent(parsed)) {
        handler(parsed, parsed.timestamp, true);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Internal artefact state (mirrors TModellingBusArtefactConnector fields)
  // ---------------------------------------------------------------------------

  private artefactStateFor<T>(artefactID: string, jsonVersion: string): ArtefactState<T> {
    const key = `${artefactID}/${jsonVersion}`;
    if (!this.artefactStates.has(key)) {
      this.artefactStates.set(key, makeArtefactState<T>());
    }
    return this.artefactStates.get(key) as ArtefactState<T>;
  }

  // ---------------------------------------------------------------------------
  // Artefact publishing
  // Mirrors TModellingBusArtefactConnector.PostJSONArtefactState/Update/Considering
  // ---------------------------------------------------------------------------

  /**
   * Publish the authoritative state of an artefact.
   * Must be called at least once before publishArtefactUpdate or
   * publishArtefactConsidering (mirrors the stateCommunicated guard in Go).
   *
   * Mirrors PostJSONArtefactState in layer_3_artefacts.go.
   *
   * @param artefactID  Unique artefact identifier.
   * @param jsonVersion JSON schema version string (e.g. "demo-v1.0-v1.0").
   * @param model       The full model to publish.
   */
  publishArtefactState<T>(artefactID: string, jsonVersion: string, model: T): void {
    const s = this.artefactStateFor<T>(artefactID, jsonVersion);
    const ts = now();
    s.current             = model;
    s.currentTimestamp    = ts;
    s.updated             = model;
    s.updatedTimestamp    = ts;
    s.considered          = model;
    s.consideredTimestamp = ts;
    s.stateCommunicated   = true;

    this.publishStreamed(
      this.cfg.agentID,
      this.statePath(artefactID, jsonVersion),
      model,
      true, // retained
    );
  }

  /**
   * Publish an update to the current artefact state (non-breaking change).
   * Auto-publishes state first if it has never been communicated.
   *
   * Note: the Go implementation sends an RFC 6902 JSON Patch (delta) via FTP.
   * This TypeScript implementation embeds the full updated model directly in the
   * MQTT payload (streamed format), which is functionally equivalent for
   * TypeScript subscribers but incompatible with Go delta-handling.
   *
   * Mirrors PostJSONArtefactUpdate in layer_3_artefacts.go.
   */
  publishArtefactUpdate<T>(artefactID: string, jsonVersion: string, model: T): void {
    const s = this.artefactStateFor<T>(artefactID, jsonVersion);

    if (!s.stateCommunicated) {
      this.publishArtefactState(artefactID, jsonVersion, model);
      return;
    }

    const ts = now();
    s.updated             = model;
    s.updatedTimestamp    = ts;
    s.considered          = model;
    s.consideredTimestamp = ts;

    this.publishStreamed(
      this.cfg.agentID,
      this.updatePath(artefactID, jsonVersion),
      model,
      true,
    );
  }

  /**
   * Publish a "considering" artefact: a speculative edit not yet committed.
   * Auto-publishes state first if it has never been communicated.
   *
   * Mirrors PostJSONArtefactConsidering in layer_3_artefacts.go.
   */
  publishArtefactConsidering<T>(artefactID: string, jsonVersion: string, model: T): void {
    const s = this.artefactStateFor<T>(artefactID, jsonVersion);

    if (!s.stateCommunicated) {
      this.publishArtefactState(artefactID, jsonVersion, model);
      return;
    }

    s.considered          = model;
    s.consideredTimestamp = now();

    this.publishStreamed(
      this.cfg.agentID,
      this.consideringPath(artefactID, jsonVersion),
      model,
      true,
    );
  }

  /**
   * Delete all three topic slots (state, update, considering) for an artefact.
   * Mirrors DeleteJSONArtefact in layer_3_artefacts.go.
   */
  deleteArtefact(artefactID: string, jsonVersion: string): void {
    this.deletePosting(this.statePath(artefactID, jsonVersion));
    this.deletePosting(this.updatePath(artefactID, jsonVersion));
    this.deletePosting(this.consideringPath(artefactID, jsonVersion));
    this.artefactStates.delete(`${artefactID}/${jsonVersion}`);
  }

  // ---------------------------------------------------------------------------
  // Artefact subscribing
  // Mirrors TModellingBusArtefactConnector.ListenForJSONArtefactState/Update/Considering
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to artefact state postings from another agent.
   *
   * When a Go agent posts via FTP, the MQTT payload is a RepositoryEvent
   * ({timestamp, "file path", server, port}). TypeScript cannot fetch FTP files,
   * so such events are logged and skipped. Use a Go agent or an HTTP proxy to
   * bridge FTP artefacts if cross-runtime interoperability is needed.
   *
   * Mirrors ListenForJSONArtefactStatePostings in layer_3_artefacts.go.
   *
   * @param fromAgentID Agent whose state to observe.
   * @param artefactID  Artefact identifier.
   * @param jsonVersion JSON schema version expected from the posting agent.
   * @param handler     Called with the decoded model and its posting timestamp.
   */
  subscribeArtefactState<T>(
    fromAgentID: string,
    artefactID:  string,
    jsonVersion:  string,
    handler: (model: T, timestamp: string) => void,
  ): void {
    this.subscribeRaw(
      fromAgentID,
      this.statePath(artefactID, jsonVersion),
      (payload, ts, isRepoEvent) => {
        if (isRepoEvent) {
          console.warn(
            `[BusClient] subscribeArtefactState(${artefactID}): received ` +
            `FTP RepositoryEvent from Go agent "${fromAgentID}". ` +
            `TypeScript clients cannot fetch FTP files — event skipped.`,
          );
          return;
        }
        handler(payload as T, ts);
      },
    );
  }

  /**
   * Subscribe to artefact update postings from another agent.
   * Mirrors ListenForJSONArtefactUpdatePostings in layer_3_artefacts.go.
   */
  subscribeArtefactUpdate<T>(
    fromAgentID: string,
    artefactID:  string,
    jsonVersion:  string,
    handler: (model: T, timestamp: string) => void,
  ): void {
    this.subscribeRaw(
      fromAgentID,
      this.updatePath(artefactID, jsonVersion),
      (payload, ts, isRepoEvent) => {
        if (isRepoEvent) {
          console.warn(
            `[BusClient] subscribeArtefactUpdate(${artefactID}): ` +
            `FTP RepositoryEvent not supported — event skipped.`,
          );
          return;
        }
        handler(payload as T, ts);
      },
    );
  }

  /**
   * Subscribe to "considering" postings from another agent.
   * Mirrors ListenForJSONArtefactConsideringPostings in layer_3_artefacts.go.
   */
  subscribeArtefactConsidering<T>(
    fromAgentID: string,
    artefactID:  string,
    jsonVersion:  string,
    handler: (model: T, timestamp: string) => void,
  ): void {
    this.subscribeRaw(
      fromAgentID,
      this.consideringPath(artefactID, jsonVersion),
      (payload, ts, isRepoEvent) => {
        if (isRepoEvent) {
          console.warn(
            `[BusClient] subscribeArtefactConsidering(${artefactID}): ` +
            `FTP RepositoryEvent not supported — event skipped.`,
          );
          return;
        }
        handler(payload as T, ts);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Coordination
  // Mirrors layer_3_coordination.go: PostCoordination / ListenForCoordinationPostings
  // ---------------------------------------------------------------------------

  /**
   * Post a coordination message to a specific agent.
   * Coordination messages are NOT retained (QoS 0, retain=false), matching Go.
   *
   * Mirrors TModellingBusConnector.PostCoordination in layer_3_coordination.go.
   *
   * @param toAgentID      Recipient agent ID (their topic root is used).
   * @param coordinationID Coordination channel identifier.
   * @param payload        JSON-serialisable coordination payload.
   */
  publishCoordination(toAgentID: string, coordinationID: string, payload: unknown): void {
    const event: StreamedEvent = { timestamp: now(), payload };
    this.client.publish(
      this.topicFor(toAgentID, this.coordPath(coordinationID)),
      JSON.stringify(event),
      { retain: false, qos: 0 },
    );
  }

  /**
   * Listen for coordination messages sent to this agent.
   *
   * Mirrors TModellingBusConnector.ListenForCoordinationPostings in layer_3_coordination.go.
   *
   * @param coordinationID Coordination channel identifier.
   * @param handler        Called with the decoded payload and its timestamp.
   */
  subscribeCoordination(
    coordinationID: string,
    handler: (payload: unknown, timestamp: string) => void,
  ): void {
    this.subscribeRaw(
      this.cfg.agentID,
      this.coordPath(coordinationID),
      (payload, ts) => handler(payload, ts),
    );
  }

  // ---------------------------------------------------------------------------
  // Typed convenience methods — DEMO Fact Model
  // ---------------------------------------------------------------------------

  /**
   * Publish a DemoModel as the authoritative state.
   * Uses the well-known JSON version identifier {@link DEMO_JSON_VERSION}.
   */
  publishDemoState(artefactID: string, model: DemoModel): void {
    this.publishArtefactState<DemoModel>(artefactID, DEMO_JSON_VERSION, model);
  }

  /**
   * Publish a DemoModel update (non-breaking change to the current state).
   */
  publishDemoUpdate(artefactID: string, model: DemoModel): void {
    this.publishArtefactUpdate<DemoModel>(artefactID, DEMO_JSON_VERSION, model);
  }

  /**
   * Publish a speculative DemoModel change (not yet committed as an update).
   */
  publishDemoConsidering(artefactID: string, model: DemoModel): void {
    this.publishArtefactConsidering<DemoModel>(artefactID, DEMO_JSON_VERSION, model);
  }

  /**
   * Subscribe to DemoModel state postings from another agent.
   */
  subscribeDemoState(
    fromAgentID: string,
    artefactID:  string,
    handler: (model: DemoModel, timestamp: string) => void,
  ): void {
    this.subscribeArtefactState<DemoModel>(fromAgentID, artefactID, DEMO_JSON_VERSION, handler);
  }

  /**
   * Subscribe to DemoModel update postings from another agent.
   */
  subscribeDemoUpdate(
    fromAgentID: string,
    artefactID:  string,
    handler: (model: DemoModel, timestamp: string) => void,
  ): void {
    this.subscribeArtefactUpdate<DemoModel>(fromAgentID, artefactID, DEMO_JSON_VERSION, handler);
  }

  // ---------------------------------------------------------------------------
  // Typed convenience methods — pimUML Model
  // ---------------------------------------------------------------------------

  /**
   * Publish a PimModel as the authoritative state.
   * Uses the well-known JSON version identifier {@link PIMUML_JSON_VERSION}.
   */
  publishPimState(artefactID: string, model: PimModel): void {
    this.publishArtefactState<PimModel>(artefactID, PIMUML_JSON_VERSION, model);
  }

  /**
   * Publish a PimModel update (non-breaking change to the current state).
   */
  publishPimUpdate(artefactID: string, model: PimModel): void {
    this.publishArtefactUpdate<PimModel>(artefactID, PIMUML_JSON_VERSION, model);
  }

  /**
   * Publish a speculative PimModel change (not yet committed as an update).
   */
  publishPimConsidering(artefactID: string, model: PimModel): void {
    this.publishArtefactConsidering<PimModel>(artefactID, PIMUML_JSON_VERSION, model);
  }

  /**
   * Subscribe to PimModel state postings from another agent.
   */
  subscribePimState(
    fromAgentID: string,
    artefactID:  string,
    handler: (model: PimModel, timestamp: string) => void,
  ): void {
    this.subscribeArtefactState<PimModel>(fromAgentID, artefactID, PIMUML_JSON_VERSION, handler);
  }

  /**
   * Subscribe to PimModel update postings from another agent.
   */
  subscribePimUpdate(
    fromAgentID: string,
    artefactID:  string,
    handler: (model: PimModel, timestamp: string) => void,
  ): void {
    this.subscribeArtefactUpdate<PimModel>(fromAgentID, artefactID, PIMUML_JSON_VERSION, handler);
  }
}
