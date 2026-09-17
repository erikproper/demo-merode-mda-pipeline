// check-mendix-against-input
// Prueft das zurueckgelesene Mendix-Modell (dump-mendix-domain.ts) gegen das
// DEMO- bzw. MERODE-Eingabemodell - also gegen den Anfang der Kette, nicht gegen
// das PIM. Damit wird die gesamte Pipeline geprueft und nicht nur ihr letzter Schritt.
//
// Geprueft wird unter anderem:
//   - jeder EntityType / ObjectType hat eine Mendix-Entity
//   - jeder kategoriale ValueType / DomainType hat eine Enumeration mit denselben Literalen
//   - jeder nicht-kategoriale ValueType / DomainType hat eine eigene Entity
//   - jedes Attribut hat eine Mendix-Spalte des erwarteten Typs bzw. eine Assoziation
//   - jeder FactType / jede ExistenceDependency hat eine Assoziation MIT KORREKTER RICHTUNG
//     (Mendix parent = Viele-Seite, child = Eins-Seite)
//   - jede Spezialisierung ist Generalisierung oder ereignisgetriggerte Assoziation
//   - jeder Lebenszyklus hat einen Status-Enum mit denselben Zustaenden
//   - jeder EventType / BusinessEventType hat ein Verhaltensartefakt
//   - kein Mendix-Artefakt ohne Ursprung im Eingabemodell
//
// Aufruf:  npx ts-node tests/check-mendix-against-input.ts <basisname>

import * as fs from "fs";
import * as path from "path";

type Kind = "MISSING" | "WRONG" | "EXTRA" | "NOTMAPPED";

interface Finding {
  kind:  Kind;
  rule:  string;
  text:  string;
}

const findings: Finding[] = [];
const add = (kind: Kind, rule: string, text: string) => findings.push({ kind, rule, text });

let checks = 0;
const ok = () => { checks++; };

// ---------------------------------------------------------------- Hilfsfunktionen

// Spiegelt makeAttributeType() aus pim-to-mendix-agent.ts
function expectedPrimitive(typeName: string | undefined): string {
  switch ((typeName ?? "").toLowerCase()) {
    case "integer":  return "Integer";
    case "boolean":  return "Boolean";
    case "datetime": return "DateTime";
    case "real":
    case "decimal":  return "Decimal";
    default:         return "String";
  }
}

function sameLiterals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

interface ExpectedAssoc {
  parent: string;   // Viele-Seite, haelt den Verweis
  child:  string;   // Eins-Seite
  origin: string;   // Ursprung im Eingabemodell, fuer die Meldung
  rule:   string;
}

interface ExpectedAttribute {
  type: string;
  def?: string;
}

interface Expectation {
  entities:        Map<string, { attributes: Map<string, ExpectedAttribute>; origin: string }>;
  enums:           Map<string, { literals: string[]; origin: string }>;
  assocs:          Map<string, ExpectedAssoc>;
  generalizations: Map<string, string>;          // child -> parent
  pages:           Set<string>;
  behaviour:       { artefacts: string[]; origin: string }[];
}

function emptyExpectation(): Expectation {
  return {
    entities: new Map(), enums: new Map(), assocs: new Map(),
    generalizations: new Map(), pages: new Set(), behaviour: [],
  };
}

function entityOf(exp: Expectation, name: string, origin: string) {
  if (!exp.entities.has(name)) exp.entities.set(name, { attributes: new Map(), origin });
  return exp.entities.get(name)!;
}

// ---------------------------------------------------------------- DEMO

function expectFromDemo(demo: any): Expectation {
  const exp = emptyExpectation();

  const valueTypes  = demo.valueTypes ?? [];
  const categorical = new Map<string, string[]>();
  const nonCategorical = new Set<string>();

  for (const vt of valueTypes) {
    if (vt.kind === "categorical") {
      categorical.set(vt.name, vt.literals ?? []);
      exp.enums.set(vt.name, { literals: vt.literals ?? [], origin: `ValueType "${vt.name}" (kategorial)` });
    } else if (vt.kind === "nonCategorical") {
      nonCategorical.add(vt.name);
      entityOf(exp, vt.name, `ValueType "${vt.name}" (nicht-kategorial)`);
    } else if (vt.kind === "associationClass") {
      const e = entityOf(exp, vt.name, `ValueType "${vt.name}" (AssociationClass)`);
      for (const a of vt.attributes ?? []) {
        e.attributes.set(a.name, { type: categorical.has(a.valueType) ? `Enumeration(${a.valueType})` : expectedPrimitive(a.valueType) });
      }
      for (const related of vt.relatesEntityTypes ?? []) {
        exp.assocs.set(`${vt.name}_${related}`, {
          parent: vt.name, child: related,
          origin: `AssociationClass "${vt.name}"`, rule: "A8/B8",
        });
      }
    }
  }

  for (const et of demo.entityTypes ?? []) {
    const e = entityOf(exp, et.name, `EntityType "${et.name}"`);
    e.attributes.set(`${et.name}ID`, { type: "Integer" });           // A3 bzw. A9: fachlicher Identifikator
    exp.pages.add(`${et.name}_Overview`);

    for (const a of et.attributes ?? []) {
      if (a.derivationRule) {
        add("NOTMAPPED", "A4/B3", `abgeleitetes Attribut "${et.name}.${a.name}" bleibt in Mendix aus - kein OCL-Aequivalent (Regel: ${a.derivationRule})`);
        continue;
      }
      if (nonCategorical.has(a.valueType)) {
        exp.assocs.set(`${et.name}_${a.name}`, {
          parent: et.name, child: a.valueType,
          origin: `Attribut "${et.name}.${a.name}" vom Typ "${a.valueType}"`, rule: "A2/B5",
        });
        continue;
      }
      e.attributes.set(a.name, { type: categorical.has(a.valueType) ? `Enumeration(${a.valueType})` : expectedPrimitive(a.valueType) });
    }
  }

  // Spezialisierungen
  for (const et of demo.entityTypes ?? []) {
    if (et.parent === undefined) continue;
    if (et.triggerEventType) {
      exp.assocs.set(`${et.name}IsA${et.parent}`, {
        parent: et.name, child: et.parent,
        origin: `ereignisgetriggerte Spezialisierung "${et.name}" von "${et.parent}"`, rule: "A7/B9",
      });
    } else if (et.isDerived) {
      exp.assocs.set(`${et.name}IsA${et.parent}`, {
        parent: et.name, child: et.parent,
        origin: `abgeleitete Spezialisierung "${et.name}" von "${et.parent}"`, rule: "A9/B9",
      });
    } else {
      exp.generalizations.set(et.name, et.parent);
    }
  }

  // FactTypes -> Assoziationen, Richtung aus den Rollenmultiplizitaeten
  for (const ft of demo.factTypes ?? []) {
    const [r0, r1] = ft.roles;
    const isMany = (r: any) => r.upper === "*" || (typeof r.upper === "number" && r.upper > 1);
    if (isMany(r0) && isMany(r1)) {
      add("WRONG", "A12/B9", `FactType "${ft.name}" ist n:m (beide Rollen upper="*") - Mendix kann das nur als gerichtete Reference abbilden, eine Seite verliert ihre Multiplizitaet`);
    }
    const manyRole = isMany(r0) ? r0 : r1;
    const oneRole  = isMany(r0) ? r1 : r0;
    exp.assocs.set(ft.name, {
      parent: manyRole.entityType, child: oneRole.entityType,
      origin: `FactType "${ft.name}" (Rolle "${manyRole.name}" ist die Viele-Seite)`,
      rule: ft.isAggregation ? "A11/B9" : "A12/B9",
    });

    if (ft.isAggregation) {
      const whole = entityOf(exp, oneRole.entityType, `EntityType "${oneRole.entityType}"`);
      whole.attributes.set(`${manyRole.name}ID`, { type: "Integer" });   // A11
    }
  }

  // A6: jeder EventType wird ein Boolean-Attribut auf seiner Entity
  for (const ev of demo.eventTypes ?? []) {
    entityOf(exp, ev.entityType, `EntityType "${ev.entityType}"`)
      .attributes.set(ev.name, { type: "Boolean", def: "false" });
    // B11/B12: eine Workflow je orthogonaler Region, B15: der zugehoerige Set-Microflow
    exp.behaviour.push({
      artefacts: [`WF_${ev.entityType}_${ev.name}`, `Set${ev.entityType}_${ev.name}`],
      origin: `EventType "${ev.name}" auf "${ev.entityType}"`,
    });
  }

  return exp;
}

// ---------------------------------------------------------------- MERODE

function expectFromMerode(merode: any): Expectation {
  const exp = emptyExpectation();

  const categorical = new Map<string, string[]>();
  const nonCategorical = new Set<string>();

  for (const dt of merode.domainTypes ?? []) {
    if (dt.kind === "categorical") {
      categorical.set(dt.name, dt.literals ?? []);
      exp.enums.set(dt.name, { literals: dt.literals ?? [], origin: `DomainType "${dt.name}" (kategorial)` });
    } else {
      nonCategorical.add(dt.name);
      entityOf(exp, dt.name, `DomainType "${dt.name}" (nicht-kategorial)`);
    }
  }

  for (const ot of merode.objectTypes ?? []) {
    const e = entityOf(exp, ot.name, `ObjectType "${ot.name}"`);
    e.attributes.set(`${ot.name}ID`, { type: "Integer" });              // M2
    exp.pages.add(`${ot.name}_Overview`);

    for (const a of ot.attributes ?? []) {
      if (nonCategorical.has(a.type)) {
        exp.assocs.set(`${ot.name}_${a.name}`, {
          parent: ot.name, child: a.type,
          origin: `Attribut "${ot.name}.${a.name}" vom Typ "${a.type}"`, rule: "M3/B5",
        });
        continue;
      }
      e.attributes.set(a.name, { type: categorical.has(a.type) ? `Enumeration(${a.type})` : expectedPrimitive(a.type) });
    }

    const states = ot.lifecycleStates ?? [];
    if (states.length > 0) {
      const statusEnum = `${ot.name}_Status`;
      exp.enums.set(statusEnum, { literals: states, origin: `Lebenszyklus von "${ot.name}"` });
      e.attributes.set("status", { type: `Enumeration(${statusEnum})` });
    }
  }

  for (const dep of merode.existenceDependencies ?? []) {
    exp.assocs.set(dep.name, {
      parent: dep.dependent, child: dep.master,
      origin: `ExistenceDependency "${dep.name}" ("${dep.dependent}" haengt von "${dep.master}" ab)`,
      rule: "M4/B9",
    });
  }

  for (const bet of merode.businessEventTypes ?? []) {
    const artefact =
      bet.role === "C" ? `Create_${bet.objectType}` :          // M6
      bet.role === "E" ? `End_${bet.objectType}`    :          // M8
                         `Set_${bet.objectType}_${bet.name}`;  // M7/B15
    exp.behaviour.push({ artefacts: [artefact], origin: `BusinessEventType "${bet.name}" (Rolle ${bet.role}) auf "${bet.objectType}"` });
  }

  return exp;
}

// ---------------------------------------------------------------- Vergleich

function compare(exp: Expectation, dump: any): void {
  const mxEntities = new Map<string, any>(dump.entities.map((e: any) => [e.name, e]));
  const mxAssocs   = new Map<string, any>(dump.associations.map((a: any) => [a.name, a]));
  const mxEnums    = new Map<string, any>(dump.enumerations.map((e: any) => [e.name, e]));
  const mxPages    = new Set<string>(dump.pages);
  const behaviourNames = [...dump.microflows.map((m: any) => m.name), ...dump.workflows];

  // Entities + Attribute
  for (const [name, e] of exp.entities) {
    const mx = mxEntities.get(name);
    if (!mx) { add("MISSING", "B2/B5", `${e.origin} hat keine Mendix-Entity "${name}"`); continue; }
    ok();

    const mxAttrs = new Map<string, any>(mx.attributes.map((a: any) => [a.name, a]));
    for (const [attrName, want] of e.attributes) {
      const actual = mxAttrs.get(attrName);
      if (actual === undefined) { add("MISSING", "B3/B13", `Entity "${name}": Attribut "${attrName}" fehlt (erwartet ${want.type})`); continue; }
      if (actual.type !== want.type) { add("WRONG", "B3/B13", `Entity "${name}.${attrName}": Typ ist ${actual.type}, erwartet ${want.type}`); continue; }
      if (want.def !== undefined && actual.defaultValue !== want.def) {
        add("WRONG", "A6/B3", `Entity "${name}.${attrName}": Vorgabewert ist ${actual.defaultValue ?? "keiner"}, erwartet ${want.def}`);
        continue;
      }
      ok();
    }
    for (const attrName of mxAttrs.keys()) {
      if (!e.attributes.has(attrName)) add("EXTRA", "B3", `Entity "${name}": Attribut "${attrName}" hat keinen Ursprung im Eingabemodell`);
    }
  }
  for (const name of mxEntities.keys()) {
    if (!exp.entities.has(name)) add("EXTRA", "B2", `Mendix-Entity "${name}" hat keinen Ursprung im Eingabemodell`);
  }

  // Enumerations
  for (const [name, en] of exp.enums) {
    const mx = mxEnums.get(name);
    if (!mx) { add("MISSING", "B4/B13", `${en.origin} hat keine Enumeration "${name}"`); continue; }
    if (!sameLiterals(en.literals, mx.literals)) {
      add("WRONG", "B4/B13", `Enumeration "${name}": Literale [${mx.literals.join(", ")}], erwartet [${en.literals.join(", ")}]`);
      continue;
    }
    ok();
  }
  for (const name of mxEnums.keys()) {
    if (!exp.enums.has(name)) add("EXTRA", "B4", `Mendix-Enumeration "${name}" hat keinen Ursprung im Eingabemodell`);
  }

  // Assoziationen samt Richtung
  for (const [name, a] of exp.assocs) {
    const mx = mxAssocs.get(name);
    if (!mx) { add("MISSING", a.rule, `${a.origin} hat keine Assoziation "${name}"`); continue; }
    if (mx.parent !== a.parent || mx.child !== a.child) {
      const flipped = mx.parent === a.child && mx.child === a.parent;
      add("WRONG", a.rule,
        `Assoziation "${name}": Richtung ist ${mx.parent}(*) -> ${mx.child}(1), erwartet ${a.parent}(*) -> ${a.child}(1)` +
        (flipped ? " - die Seiten sind vertauscht, der Fremdschluessel liegt auf der falschen Entity" : "") +
        ` [${a.origin}]`);
      continue;
    }
    if (mx.type !== "Reference") {
      add("WRONG", a.rule, `Assoziation "${name}": Typ ist ${mx.type}, erwartet Reference (Eins-zu-viele)`);
      continue;
    }
    ok();
  }
  for (const name of mxAssocs.keys()) {
    if (!exp.assocs.has(name)) add("EXTRA", "B9", `Mendix-Assoziation "${name}" hat keinen Ursprung im Eingabemodell`);
  }

  // Generalisierungen
  for (const [child, parent] of exp.generalizations) {
    const mx = mxEntities.get(child);
    if (!mx) continue;
    if (mx.generalization !== parent) {
      add("WRONG", "A10/B10", `Entity "${child}": Generalisierung ist ${mx.generalization ?? "keine"}, erwartet "${parent}"`);
      continue;
    }
    ok();
  }
  for (const e of dump.entities) {
    if (e.generalization && exp.generalizations.get(e.name) !== e.generalization) {
      add("EXTRA", "B10", `Entity "${e.name}" erbt von "${e.generalization}", das Eingabemodell sieht das nicht vor`);
    }
  }

  // Pages
  for (const page of exp.pages) {
    if (!mxPages.has(page)) { add("MISSING", "B14", `Page "${page}" fehlt`); continue; }
    ok();
  }
  for (const page of mxPages) {
    if (!exp.pages.has(page)) add("EXTRA", "B14", `Mendix-Page "${page}" hat keinen Ursprung im Eingabemodell`);
  }

  // Verhalten
  const behaviourSet = new Set<string>(behaviourNames);
  for (const b of exp.behaviour) {
    const fehlend = b.artefacts.filter(a => !behaviourSet.has(a));
    if (fehlend.length > 0) {
      add("MISSING", "B11/B12/B15/B16", `${b.origin}: ${fehlend.map(f => `"${f}"`).join(" und ")} fehlt`);
      continue;
    }
    ok();
  }
}

// ---------------------------------------------------------------- main

function main(): void {
  const base = process.argv[2];
  if (!base) {
    console.error("Aufruf: npx ts-node tests/check-mendix-against-input.ts <basisname>");
    process.exit(2);
  }

  const inputFile = path.resolve(__dirname, `${base}.json`);
  const dumpFile  = process.argv[3]
    ? path.resolve(process.cwd(), process.argv[3])
    : path.resolve(__dirname, `../../thesis-notes/EVAL/Eval_new/${base}.mendix.json`);

  for (const f of [inputFile, dumpFile]) {
    if (!fs.existsSync(f)) { console.error(`Datei nicht gefunden: ${f}`); process.exit(2); }
  }

  const input = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const dump  = JSON.parse(fs.readFileSync(dumpFile, "utf-8"));

  const language = input.entityTypes ? "DEMO" : input.objectTypes ? "MERODE" : null;
  if (!language) { console.error("Eingabemodell ist weder DEMO noch MERODE"); process.exit(2); }

  console.log(`[check] Eingabe : ${inputFile}`);
  console.log(`[check] Mendix  : ${dumpFile}`);
  console.log(`[check] Sprache : ${language}\n`);

  const exp = language === "DEMO" ? expectFromDemo(input) : expectFromMerode(input);
  compare(exp, dump);

  const order: Kind[] = ["MISSING", "WRONG", "EXTRA", "NOTMAPPED"];
  for (const kind of order) {
    const group = findings.filter(f => f.kind === kind);
    if (group.length === 0) continue;
    console.log(`${kind} (${group.length}):`);
    for (const f of group) console.log(`  [${f.rule}] ${f.text}`);
    console.log("");
  }

  const errors = findings.filter(f => f.kind !== "NOTMAPPED").length;
  const notMapped = findings.filter(f => f.kind === "NOTMAPPED").length;
  console.log(`[check] ${checks} Pruefungen bestanden, ${errors} Abweichung(en), ${notMapped} begruendete Auslassung(en)`);
  if (errors > 0) process.exit(1);
  console.log("[check] das Mendix-Modell deckt sich vollstaendig mit dem Eingabemodell");
}

main();
