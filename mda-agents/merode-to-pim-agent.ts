// merode-to-pim-agent
// Listens on the bus for MERODE models and transforms them into pimUML models.

import { BusClient } from "./bus-client";
import type { MerodeModel, PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta, attachMeta, TraceEntry } from "./agent-utils";

const config = getBusConfig("merode-to-pim-agent");

const SOURCE_AGENT_ID = process.env.MERODE_PUBLISHER_AGENT_ID ?? "api-server";
const IN_ARTEFACT     = "model.cim.raw";
const OUT_ARTEFACT    = "model.pim.created";

const validateMerode = makeValidator("merode-schema.json");
const validatePim    = makeValidator("pimuml-schema.json");

function transform(merode: MerodeModel): { pim: PimModel; trace: TraceEntry[] } {
  const trace: TraceEntry[] = [];

  // index events by owning ObjectType for FSM construction
  const eventsByOT = new Map<string, typeof merode.businessEventTypes & {}>();
  for (const bet of merode.businessEventTypes ?? []) {
    const list = eventsByOT.get(bet.objectType) ?? [];
    list.push(bet);
    eventsByOT.set(bet.objectType, list);
  }

  const classes: PimModel["classes"] = [];
  const stateMachines: PimModel["stateMachines"] = [];

  for (const ot of merode.objectTypes) {
    // M1: ObjectType -> Class + Integer-ID
    trace.push({ sourceType: "ObjectType", sourceName: ot.name, targetType: "Class", targetName: ot.name });
    const ownedAttributes = [
      { name: `${ot.name}ID`, type: "Integer", isID: true },
      ...(ot.attributes ?? []).map(a => {
        trace.push({ sourceType: "Attribute", sourceName: `${ot.name}.${a.name}`, targetType: "Property", targetName: `${ot.name}.${a.name}` });
        return { name: a.name, type: a.type ?? "String" };
      }),
    ];
    classes.push({ name: ot.name, ownedAttributes });

    // M5–M8: sequential StateMachine if lifecycleStates are defined
    const lcStates = ot.lifecycleStates;
    if (lcStates && lcStates.length > 0) {
      const otEvents = eventsByOT.get(ot.name) ?? [];

      const smStates = [
        { name: "__initial", kind: "initial" as const },
        ...lcStates.map(s => ({ name: s, kind: "simple" as const })),
        { name: "__final",   kind: "final"   as const },
      ];

      const smTransitions: PimModel["stateMachines"] extends Array<infer SM> ? SM extends { regions: Array<infer R> } ? R extends { transitions: infer T } ? T : never : never : never = [];
      const smActivities:  PimModel["stateMachines"] extends Array<infer SM> ? SM extends { activities?: infer A } ? A : never : never = [];

      for (const evt of otEvents) {
        if (evt.role === "C") {
          // M6: creating event - initial pseudostate -> first lifecycle state
          smTransitions.push({ from: "__initial", to: lcStates[0], trigger: evt.name });
          smActivities.push({ name: `Create_${ot.name}`, kind: "create", targetType: ot.name });
          trace.push({ sourceType: "BusinessEventType", sourceName: evt.name, targetType: "Transition", targetName: `__initial->${lcStates[0]}` });
        } else if (evt.role === "M") {
          // M7: modifying event - explicit fromState/toState or sequential fallback
          const from = evt.fromState ?? lcStates[0];
          const toIdx = lcStates.indexOf(from) + 1;
          const to   = evt.toState ?? (toIdx < lcStates.length ? lcStates[toIdx] : lcStates[lcStates.length - 1]);
          smTransitions.push({ from, to, trigger: evt.name });
          smActivities.push({ name: `Set_${ot.name}_${evt.name}`, kind: "set", targetType: ot.name });
          trace.push({ sourceType: "BusinessEventType", sourceName: evt.name, targetType: "Transition", targetName: `${from}->${to}` });
        } else if (evt.role === "E") {
          // M8: ending event - last lifecycle state -> final pseudostate
          const lastState = lcStates[lcStates.length - 1];
          smTransitions.push({ from: lastState, to: "__final", trigger: evt.name });
          smActivities.push({ name: `End_${ot.name}`, kind: "end", targetType: ot.name });
          trace.push({ sourceType: "BusinessEventType", sourceName: evt.name, targetType: "Transition", targetName: `${lastState}->__final` });
        } else {
          trace.push({ sourceType: "BusinessEventType", sourceName: evt.name, targetType: "NotMapped", targetName: "-" });
        }
      }

      stateMachines.push({
        name: `SM_${ot.name}`,
        entityType: ot.name,
        regions: [{ name: "lifecycle", states: smStates, transitions: smTransitions as any }],
        activities: smActivities as any,
      });
      trace.push({ sourceType: "ObjectType", sourceName: ot.name, targetType: "StateMachine", targetName: `SM_${ot.name}` });
    } else {
      // no lifecycleStates - record events as NotMapped
      for (const bet of eventsByOT.get(ot.name) ?? []) {
        trace.push({ sourceType: "BusinessEventType", sourceName: bet.name, targetType: "NotMapped", targetName: "-" });
      }
    }
  }

  // M4: ExistenceDependency -> Association
  const associations = (merode.existenceDependencies ?? []).map(dep => {
    trace.push({ sourceType: "ExistenceDependency", sourceName: dep.name, targetType: "Association", targetName: dep.name });
    return {
      name: dep.name,
      memberEnds: [
        { name: "dependent", type: dep.dependent, lower: 0,              upper: "*"             },
        { name: "master",    type: dep.master,    lower: dep.lower ?? 1, upper: dep.upper ?? 1  },
      ] as [any, any],
    };
  });

  return {
    pim: {
      name: `${merode.name} – pimUML`,
      classes,
      associations,
      stateMachines: stateMachines.length > 0 ? stateMachines : undefined,
    },
    trace,
  };
}

async function main() {
  console.log(`[merode-to-pim] starting - listening for "${IN_ARTEFACT}" from "${SOURCE_AGENT_ID}"`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[merode-to-pim] connected to ${config.broker}:${config.port}`);

  bus.subscribeCimState<MerodeModel>(SOURCE_AGENT_ID, IN_ARTEFACT, (rawModel: MerodeModel, timestamp: string) => {
    const { clean: model, meta } = extractMeta(rawModel);

    if (meta._source?.format !== "merode") {
      console.log(`[merode-to-pim] ignoring format "${meta._source?.format}"`);
      return;
    }

    console.log(`[merode-to-pim] received merode model at ${timestamp}`);

    try {
      assertValid(validateMerode, model, "merode-schema.json");
    } catch (err) {
      console.error("[merode-to-pim] invalid input:", (err as Error).message);
      return;
    }

    const { pim: pimModel, trace } = transform(model);
    console.log(`[merode-to-pim] transformed: ${pimModel.classes?.length ?? 0} classes, ${pimModel.associations?.length ?? 0} associations, ${trace.length} trace entries`);

    try {
      assertValid(validatePim, pimModel, "pimuml-schema.json");
    } catch (err) {
      console.error("[merode-to-pim] output invalid:", (err as Error).message);
      return;
    }

    bus.publishPimState(OUT_ARTEFACT, attachMeta(pimModel, { ...meta, _trace: trace }));
    console.log(`[merode-to-pim] published to "${OUT_ARTEFACT}"`);
  });

  console.log("[merode-to-pim] listening … (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[merode-to-pim] unhandled error:", err);
    process.exit(1);
  });
}
