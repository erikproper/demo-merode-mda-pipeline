# Design Decisions (D2)

Architectural documentation of the Modelling Bus. These notes record which decisions were made, when and why, including the alternatives that were rejected. I kept them during the design phase so that I could later explain why the bus looks the way it does and not differently.

---

## 1. System Overview

The Modelling Bus is a loosely coupled, agent-based MDA pipeline. The basic idea, which was adopted and extended by Blanc et al. [2], is to externalise the transformation logic of each CIM language into a standalone agent that publishes to a shared bus. Any number of agents can co-exist. The downstream agent (`pim-to-mendix-agent`) subscribes to PIM artefacts regardless of which upstream agent published them.

The system has three layers. The CIM layer contains format-specific agents that read in CIM models and output PIM models. The bus layer is the MQTT broker (Eclipse Mosquitto), through which schema-validated PIM messages flow. The PSM layer consists of the `pim-to-mendix-agent`, which consumes PIM models and generates Mendix SDK calls.

What distinguishes this approach from previous work is that Bzowski [4] defined the pimUML vocabulary and the A-rules theoretically, but never automated the pipeline. Krouwel et al. [11] automated a pipeline, but hard-coded DEMO as the sole input and did not use an explicit PIM. This thesis automates Bzowski's pipeline and extends it to support multiple input languages by making the PIM the contract between the layers.

---

## 2. Decision Protocol

### DD1 - MQTT as a message bus

Eclipse Mosquitto (MQTT 3.1.1) was chosen as the broker after comparing several approaches.

REST/HTTP is ruled out because it is synchronous and tightly coupled: Agent B would need to know Agent A's address, which violates AR6. A shared database would also be possible, but would introduce more coupling and make it harder to start agents independently. Apache Kafka would be more powerful, but significantly over-engineered for a research prototype; the consumer group model offers no added value here, as no partitioning is required.

MQTT is lightweight, publish/subscribe-based and well-suited to distributed agent architectures. Eclipse Mosquitto runs effortlessly as a Docker container. The key feature is the retained message function: every agent that connects immediately receives the last known state of each topic without having to wait for a republish. This makes the broker a persistent state store, which considerably simplifies development and debugging. The publish/subscribe model naturally implements the decoupling of AR2.

Known limitations: MQTT does not guarantee ordered delivery across different topics, and the broker is a single point of failure. Both are acceptable for a research prototype.

### DD2 - JSON Schema as a PIM metalanguage

The pimUML-PIM is represented as a JSON Schema-validated JSON document.
Bzowski [4] defined pimUML as a UML profile, but a specific serialisation format is required for pipeline automation. The proposal explicitly refers to Colantoni et al. [5], who demonstrate that JSON Schema is suitable as a meta-language for MDE artefacts.

XMI, as the standard UML format, is ruled out because it requires a heavy toolchain (Eclipse, Ecore metamodels) and is poorly suited to the TypeScript-native Mendix SDK environment. YAML is human-readable, but offers no better tooling support for schema validation than JSON. Pure TypeScript interfaces lose language neutrality and do not allow for programmatic schema compliance checks.

JSON is native to the Mendix SDK, is transported natively via MQTT, and can be validated directly with AJV. The `additionalProperties: false` enforcement is exactly what is needed to prevent silent schema drift. This design principle is already derived from Bzowski.

### DD3 - pimUML as a PIM language

The thesis builds directly on Bzowski [4]. He defined the A-rules from the DEMO Fact Model to pimUML and the B-rules from pimUML to Mendix. The task here is to automate these rules and extend pimUML to MERODE.

Defining a completely new PIM would be a more significant contribution, but would also require justifying every design decision independently. Building on Bzowski's work anchors the PIM in existing academic research and allows the thesis to focus on pipeline architecture and the MERODE extension, rather than on the PIM language design itself.

pimUML covers three types of UML diagram: class diagram (structural), state machine diagram (behavioural) and activity diagram (operations). In the prototype, class and state machine diagrams are utilised in full; the activity diagram is utilised in part (activities are recorded as typed objects in the PIM, but are not represented as complete UML activity diagrams).

### DD4 - Sequential FSMs for MERODE lifecycles

MERODE object lifecycles are represented as sequential finite-state machines with named, ordered states and a final state, rather than as orthogonal Boolean regions as in DEMO.

This was the most significant design decision in the MERODE extension. Three options were available.

Option A would have reused DEMO's Boolean region encoding: each business event type as an orthogonal region with `false`/`true` states, regardless of the source language. This would have meant maximum schema reuse, but would have been semantically incorrect. MERODE lifecycle states are mutually exclusive (an object is either `active` or `completed`, never both), whereas Boolean regions represent independent flags in any combination. This would have produced structurally invalid models, and the thesis could not have claimed semantic correctness for MERODE.

Option C would have removed MERODE FSMs from the scope entirely. This would have left the schema's extensibility property unaffected, but would have meant claiming only structural transformation for MERODE, not behavioural transformation. This would undermine the thesis's claim to heterogeneity.

Option B was chosen: one region, one initial pseudo-state, named life-cycle states (kind: `simple`), one final state. This corresponds to Snoeck's description in Chapter 6: "life cycle states are successive phases of the object's life" (p. 127). The cost is a minimal PIM extension. The benefit is semantic fidelity. The fact that this option necessitates an extension is in itself a finding: the pimUML schema designed for DEMO is almost, but not entirely, sufficient for MERODE. Documenting precisely this contributes to the question of what a "common PIM" must achieve for heterogeneous enterprise models.

### DD5 - Additive, backwards-compatible PIM schema extension

`pimuml-schema.json` has been minimally extended so that all DEMO-generated PIM instances continue to validate without any changes to the DEMO agent.

Three changes were made. `State.kind` was extended from `["initial","false","true"]` to `["initial","false","true","simple","final"]`, whereby DEMO states use only `initial`, `false`, `true`, and MERODE states use `initial`, `simple`, `final` - no conflict. `Activity.kind` has been extended from `["set","create"]` to `["set","create","end"]`, because MERODE requires `end` activities for termination events; the DEMO agent does not generate any `end` activities, so nothing changes there. `Region.forEvent` has been changed from de facto mandatory to optional, because MERODE regions do not have a per-event annotation.

The point of debate is the optionalisation of `forEvent`: technically, this is a relaxation of a restriction, not a purely additive extension. In practice, no DEMO-generated PIM therefore fails; all continue to set this field. Conceptually, however, it is a relaxation, which is documented in LIMITATIONS.md.

### DD6 - The `isMerodeFSM()` discriminator in the PSM agent

The `pim-to-mendix-agent` uses a helper function `isMerodeFSM(sm)` to distinguish between MERODE state machines and DEMO state machines and to apply different B-rules accordingly.

When the PIM arrives at the Mendix agent, it no longer carries any metadata about the source language. However, the B-rules for DEMO FSMs (B11-B12: workflow generation) and MERODE FSMs (B13-B16: status enum and microflows) are different.

The differentiation function returns `true` if none of the regions in the state machine carry a `forEvent` annotation. DEMO-FSMs always set `forEvent` (one region per event). MERODE-FSMs never do so (one region per object type, no event annotation). This is a structural property of the PIM encoding, not an explicit language tag.

An explicit `sourceLanguage` tag in the PIM would violate AR2, as the PIM is intended to be a language-neutral intermediate format. If the downstream agent knew which CIM language had generated the model, this would break language isolation. Using a structural PIM property as a distinguishing feature keeps the isolation intact.

Known limitation: the approach is elegant, but fragile if a third language uses a similar FSM structure without event annotations. For the current scope (DEMO and MERODE), the discriminator is unambiguous. A more robust design would use an explicit `fsmStyle: "orthogonal" | "sequential"` field in the StateMachine definition, but this would constitute a more intrusive schema change.

### DD7 - TypeScript/Node.js for all agents

All agents are implemented in TypeScript on Node.js. The Mendix Platform SDK is native to TypeScript, which leaves no real alternative for the agent calling the SDK. Using the same language for all agents reduces cognitive overhead and enables the sharing of utility code (`bus-client.ts`, `agent-utils.ts`). Bzowski [4] used TypeScript for his manual transformations, which makes it easier to build on previous work. AJV, as a JSON Schema validator, is excellent within the TypeScript ecosystem.

Python has good NLP/AI libraries, but no Mendix SDK. Java and Go are ruled out for the same reason.

### DD8 - Docker Compose for deployment

All services (MQTT broker, API server, agents) run as Docker containers, orchestrated by Docker Compose on a Raspberry Pi 4. Docker Compose provides a reproducible, versioned deployment configuration. Adding a new agent simply involves inserting a service block into `docker-compose.yml`. This is a concrete indicator of the effort involved in "adding a new language".

The Raspberry Pi as the target platform demonstrates that the system is lightweight and does not require heavy infrastructure.

### DD9 - Retained MQTT Messages

All published artefacts use the MQTT flag `retain: true`. Without retained messages, an agent connecting after a publication would receive nothing and would not know the current bus status. With retained messages, the broker acts as a persistent state store. A freshly started `pim-to-mendix-agent` immediately receives the current PIM for each artefact. This makes the bus semantically significant: it represents the most recently agreed state of each artefact, not just a transient communication channel.

### DD10 - `X-Input-Format` header for language selection

The API server routes requests to the correct CIM schema validator and the correct MQTT topic based on the `X-Input-Format` header (values: `demo` or `merode`). Automatic language detection based on the model structure was discarded because two languages may share structural similarities that make reliable detection difficult. An explicit header is simpler and clearer.

### DD11 - Multiple subscriptions in the Mendix agent

The `pim-to-mendix-agent` subscribes to PIM artefacts from all CIM agents, not just the DEMO agent. The original prototype had `SOURCE_AGENT_ID = "demo-to-pim-agent"` hard-coded. When MERODE was added, the Mendix agent did receive MERODE PIM messages but ignored them because it had only subscribed to the DEMO agent topic.

The solution was an environment variable `PIM_PUBLISHER_AGENT_IDS` (default value: `"demo-to-pim-agent,merode-to-pim-agent"`), from which all agent IDs are read at start-up. This is a change to the Mendix agent and is therefore relevant to the extensibility claim, as discussed in EXTENSIBILITY_EVIDENCE.md.

### DD12 - Hard Delete for MERODE termination events

The pimUML construct `activity.kind = "end"` (M8) is mapped to a Mendix `DeleteObjectAction` microflow: the object is physically deleted from the database.

Snoeck does not require this. An ending event brings the object into a final state: "ending an object is not the same as physically removing the object, but it only means that a physical removal is allowed" (Section 5.2.1, p. 113). Physical deletion is therefore permissible, but is a decision for the generator. Three alternatives were considered.

Soft delete (set status attribute to `final`): The status attribute from B13 would be used as a "tombstone". Advantage: Data loss due to accidental deletion can be prevented; historical data is retained. Disadvantage: All queries would need to be extended to include a `status != final` filter; this requires application logic that goes beyond the scope of the prototype.

Archiving (moving to an archive table): Common practice in production Mendix apps. Requires one archive entity per object type - too complex for the prototype.

Hard delete via `DeleteAction` was chosen because Snoeck permits it and it requires no additional infrastructure. The trade-off: the generator does not apply any delete behaviour to the associations; the Mendix standard `DeleteMeButKeepReferences` applies. Deleting a master is neither blocked nor cascaded; dependent objects (e.g. RentalLines of a deleted Rental) are left behind without a reference. Existence dependency is therefore not enforced during deletion. Enforcement would be possible via `DeleteMeIfNoReferences` on the master side, but this has not been implemented.

For a production application, soft delete or archiving would be the better choice. This restriction is documented in LIMITATIONS.md.

### DD13 - ACR microflow as an after-create handler with early commit

According to pimUML semantics, a StateMachine starts as soon as the class is instantiated. Bzowski [4] (section 11.2.3) implements this using an After-Create event handler `ACR_<Entity>`, which starts the region workflows. The agent has therefore been registering `ACR_<Entity>` since 2026-09-14 as an `EventHandler` (Moment After, Event Create, object is passed) on the entity.

Problem: After Create runs before the object has been committed for the first time. However, Mendix only starts workflows for committed objects ("Only committed persistent objects can be used to start a workflow", observed on 2026-08-21). Three variants were considered.

After Create without commit: formally identical to Bzowski, but fails at runtime upon the first workflow call.

After Commit: the object is definitely committed, but the handler runs with every commit and would start the region workflows multiple times. A safeguard against this would require an additional attribute that does not exist in the PIM.

After Create with Commit as the first action in the ACR microflow was chosen. It adheres to Bzowski's timing (instantiation) and starts the workflows exactly once. The cost: a newly created object is immediately present in the database, even if the user subsequently aborts the form. This restriction is documented in LIMITATIONS.md.

---

## 3. Implementation details not related to architecture

Some decisions are pragmatic and do not require thesis-level justification, but are recorded here for the sake of completeness.

The logical identifier is called `${ot.name}ID` instead of `id`, because Mendix treats `id` as a reserved system field name (CE7247). Enum literals in microflow expressions are written without quotation marks (`Module.Enum.Value`), because Mendix does not accept quoted enum references (CE0117). Enum values are automatically assigned an English caption with an uppercase first letter, because Mendix requires at least one language caption and otherwise throws CW0263. No Mendix workflow generation is performed for MERODE FSMs, because MERODE regions do not contain a `forEvent` and workflow generation would otherwise produce `Wait_undefined`.
