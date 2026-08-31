// pim-to-sql-agent
// Generates a runnable PostgreSQL DDL script from a pimUML model.
// Second PSM target alongside pim-to-mendix-agent - consumes the exact same
// model.pim.created artefact, no changes required to any existing agent or schema.

import * as fs from "fs";
import * as path from "path";
import { BusClient } from "./bus-client";
import type { PimModel } from "./schemas/types";
import { getBusConfig, makeValidator, assertValid, extractMeta } from "./agent-utils";

// Same discriminator as pim-to-mendix-agent.ts:66 - distinguishes a MERODE sequential
// lifecycle (one region, no forEvent) from a DEMO orthogonal FSM (one region per event).
function isMerodeFSM(sm: PimModel["stateMachines"] extends Array<infer S> ? S : never): boolean {
  return sm.regions.length > 0 && sm.regions.every(r => !r.forEvent);
}

function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function sqlType(typeName: string | undefined, enumNames: Set<string>): string {
  if (typeName && enumNames.has(typeName)) return `${toSnakeCase(typeName)}_enum`;
  switch ((typeName ?? "").toLowerCase()) {
    case "integer":  return "INTEGER";
    case "boolean":  return "BOOLEAN";
    case "date":
    case "datetime": return "TIMESTAMP";
    case "number":
    case "decimal":
    case "real":     return "NUMERIC";
    case "string":   return "TEXT";
    default:         return "TEXT"; // unknown PIM type -> TEXT fallback (documented limitation)
  }
}

function sqlLiteral(value: string, colType: string): string {
  if (colType === "BOOLEAN" || colType === "INTEGER" || colType === "NUMERIC") return value;
  return `'${value.replace(/'/g, "''")}'`;
}

// Double-quote every table/column identifier so a PIM name that happens to collide
// with a SQL reserved word (e.g. an attribute literally called "group") still produces
// runnable DDL instead of a syntax error.
function q(ident: string): string {
  return `"${ident}"`;
}

interface TableDef {
  name:      string; // snake_case SQL table name
  columns:   string[]; // rendered column definitions, in declaration order
  pkColumn:  string; // name of this table's primary key column
  dependsOn: string[]; // pim.classes/dataTypes/... names this table has an FK to
}

// S12: Kahn's algorithm over the FK dependency graph, so CREATE TABLE statements never
// reference a table that hasn't been declared yet. Throws instead of silently emitting an
// invalid order if the graph has a cycle - a cycle would make the DDL fail at execution
// time regardless, so failing fast here is strictly more useful.
function topoSortTables(tables: Map<string, TableDef>): TableDef[] {
  const inDegree   = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const key of tables.keys()) { inDegree.set(key, 0); dependents.set(key, []); }

  for (const [key, table] of tables) {
    for (const dep of table.dependsOn) {
      if (!tables.has(dep) || dep === key) continue; // unknown table or harmless self-FK
      inDegree.set(key, (inDegree.get(key) ?? 0) + 1);
      dependents.get(dep)!.push(key);
    }
  }

  const queue  = [...tables.keys()].filter(k => inDegree.get(k) === 0);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    sorted.push(key);
    for (const dep of dependents.get(key) ?? []) {
      const newDegree = inDegree.get(dep)! - 1;
      inDegree.set(dep, newDegree);
      if (newDegree === 0) queue.push(dep);
    }
  }

  if (sorted.length !== tables.size) {
    const remaining = [...tables.keys()].filter(k => !sorted.includes(k));
    throw new Error(`pim-to-sql-agent: cyclic foreign-key dependency among tables: ${remaining.join(", ")}`);
  }

  return sorted.map(key => tables.get(key)!);
}

// Pure transform: PimModel -> PostgreSQL DDL script. No I/O, no bus - directly
// unit-testable (see tests/test-sql-agent.ts). Built up rule by rule (S1, S2, ...).
export function pimToSql(pim: PimModel): string {
  const enumNames = new Set((pim.enumerations ?? []).map(e => e.name));
  const typeStatements: string[] = [];

  // S1: enumerations -> CREATE TYPE ... AS ENUM
  for (const en of pim.enumerations ?? []) {
    const typeName = `${toSnakeCase(en.name)}_enum`;
    const literals = en.literals.map(l => `'${l.replace(/'/g, "''")}'`).join(", ");
    typeStatements.push(`CREATE TYPE ${typeName} AS ENUM (${literals});`);
  }

  const tables = new Map<string, TableDef>();

  // S2: non-categorical DataTypes -> own table, id-only.
  // Mirrors the same PIM-level limitation as pim-to-mendix-agent.ts's B4/B9 (a DataType
  // carries no structure of its own in pimUML) rather than inventing a SQL-specific
  // inline-scalar shortcut that would break comparability between the two PSM outputs.
  for (const dt of pim.dataTypes ?? []) {
    tables.set(dt.name, { name: toSnakeCase(dt.name), columns: [`  ${q("id")} SERIAL PRIMARY KEY`], pkColumn: "id", dependsOn: [] });
  }

  const dataTypeNames = new Set((pim.dataTypes ?? []).map(dt => dt.name));

  // S4/S6: classes -> CREATE TABLE with attribute columns
  for (const cls of pim.classes ?? []) {
    const columns: string[] = [];
    const dependsOn: string[] = [];
    let pkColumn: string | undefined;

    for (const prop of cls.ownedAttributes ?? []) {
      if (prop.isDerived) continue; // S5: no OCL/computed-column equivalent, same as B-rule
      if (prop.type && dataTypeNames.has(prop.type)) {
        // S6: DataType-typed attribute -> deferred FK column, not an inline column
        const refTable = tables.get(prop.type);
        if (!refTable) continue;
        const fkCol = `${toSnakeCase(prop.name)}_id`;
        columns.push(`  ${q(fkCol)} INTEGER REFERENCES ${q(refTable.name)}(${q(refTable.pkColumn)})`);
        dependsOn.push(prop.type);
        continue;
      }
      const colName = toSnakeCase(prop.name);
      const colType = sqlType(prop.type, enumNames);
      let colDef = `  ${q(colName)} ${colType}`;
      if (prop.isID) { colDef += " PRIMARY KEY"; pkColumn = colName; }
      if (prop.defaultValue !== undefined) colDef += ` DEFAULT ${sqlLiteral(prop.defaultValue, colType)}`;
      columns.push(colDef);
    }

    if (!pkColumn) { columns.unshift(`  ${q("id")} SERIAL PRIMARY KEY`); pkColumn = "id"; }

    tables.set(cls.name, { name: toSnakeCase(cls.name), columns, pkColumn, dependsOn });
  }

  // S3: association classes -> junction table (own synthetic id + two FKs) + own attributes.
  // Analogous to B8 (entity + two associations); unlike a plain n:m association (S9) an
  // association class can carry its own attributes, so it always needs a real table.
  for (const ac of pim.associationClasses ?? []) {
    const columns: string[] = [`  ${q("id")} SERIAL PRIMARY KEY`];
    const dependsOn: string[] = [];

    for (const end of ac.memberEnds) {
      const refTable = tables.get(end.type);
      if (!refTable) continue;
      const fkCol = `${toSnakeCase(end.name)}_id`;
      columns.push(`  ${q(fkCol)} INTEGER NOT NULL REFERENCES ${q(refTable.name)}(${q(refTable.pkColumn)})`);
      dependsOn.push(end.type);
    }
    for (const prop of ac.ownedAttributes ?? []) {
      if (prop.isDerived) continue;
      columns.push(`  ${q(toSnakeCase(prop.name))} ${sqlType(prop.type, enumNames)}`);
    }

    tables.set(ac.name, { name: toSnakeCase(ac.name), columns, pkColumn: "id", dependsOn });
  }

  // S7: generalizations -> child gets an extra mandatory FK column to the parent table.
  // Deliberate simplification: pimUML gives every class (including generalization
  // children) its own independent id property rather than a shared/inherited PK, so
  // there is no natural PK-sharing convention to mirror here (see LIMITATIONS.md).
  for (const gen of pim.generalizations ?? []) {
    const child  = tables.get(gen.child);
    const parent = tables.get(gen.parent);
    if (!child || !parent) continue;
    const fkCol = `${toSnakeCase(gen.parent)}_id`;
    child.columns.push(`  ${q(fkCol)} INTEGER NOT NULL REFERENCES ${q(parent.name)}(${q(parent.pkColumn)}) ON DELETE CASCADE`);
    child.dependsOn.push(gen.parent);
  }

  // S8: one-to-one / one-to-many associations -> FK column on the "many" (or arbitrary
  // "1") side. Same oneEnd/manyEnd determination as pim-to-mendix-agent.ts:222.
  for (const assoc of pim.associations ?? []) {
    const [end0, end1] = assoc.memberEnds;
    if (end0.upper === "*" && end1.upper === "*") continue; // n:m -> handled separately (S9)

    const [oneEnd, manyEnd] = end0.upper === "*" ? [end1, end0] : [end0, end1];
    const oneTable  = tables.get(oneEnd.type);
    const manyTable = tables.get(manyEnd.type);
    if (!oneTable || !manyTable) continue;

    const fkCol   = `${toSnakeCase(oneEnd.name)}_id`;
    const notNull = (oneEnd.lower ?? 0) >= 1 ? "NOT NULL " : "";
    manyTable.columns.push(`  ${q(fkCol)} INTEGER ${notNull}REFERENCES ${q(oneTable.name)}(${q(oneTable.pkColumn)})`);
    manyTable.dependsOn.push(oneEnd.type);
  }

  // S9: many-to-many associations -> junction table with two NOT NULL FKs, no attributes.
  // Contrast with S3 (association class): a plain n:m association carries no attributes
  // of its own, so no synthetic id column is needed either - the two FKs together are
  // already a natural composite key candidate, but we still add a synthetic id for
  // consistency with every other generated table.
  for (const assoc of pim.associations ?? []) {
    const [end0, end1] = assoc.memberEnds;
    if (!(end0.upper === "*" && end1.upper === "*")) continue;

    const table0 = tables.get(end0.type);
    const table1 = tables.get(end1.type);
    if (!table0 || !table1) continue;

    const columns = [`  ${q("id")} SERIAL PRIMARY KEY`];
    const dependsOn = [end0.type, end1.type];
    for (const [end, refTable] of [[end0, table0], [end1, table1]] as const) {
      const fkCol = `${toSnakeCase(end.name)}_id`;
      columns.push(`  ${q(fkCol)} INTEGER NOT NULL REFERENCES ${q(refTable.name)}(${q(refTable.pkColumn)})`);
    }

    tables.set(assoc.name, { name: toSnakeCase(assoc.name), columns, pkColumn: "id", dependsOn });
  }

  // S10: MERODE sequential FSM -> status column + <entity>_status_enum type, mirroring
  // B13's <Entity>_Status enum. S11: DEMO orthogonal FSMs need no rule here - their states
  // are already plain boolean attributes on the class and flow through S4 automatically.
  for (const sm of pim.stateMachines ?? []) {
    if (!isMerodeFSM(sm)) continue;
    const table = tables.get(sm.entityType);
    if (!table) continue;

    const lcStates = sm.regions[0].states.filter(s => s.kind === "simple").map(s => s.name);
    if (lcStates.length === 0) continue;

    const statusEnumName = `${toSnakeCase(sm.entityType)}_status_enum`;
    const literals = lcStates.map(s => `'${s.replace(/'/g, "''")}'`).join(", ");
    typeStatements.push(`CREATE TYPE ${statusEnumName} AS ENUM (${literals});`);

    table.columns.push(`  ${q("status")} ${statusEnumName}`);
  }

  const createStatements = topoSortTables(tables).map(t => `CREATE TABLE ${q(t.name)} (\n${t.columns.join(",\n")}\n);`);

  const header = [
    `-- Generated by pim-to-sql-agent from pimUML model "${pim.name}"`,
    `-- Do not edit by hand.`,
  ].join("\n");

  return [header, ...typeStatements, ...createStatements].join("\n\n") + "\n";
}

function slugify(name: string): string {
  return toSnakeCase(name.replace(/[^a-zA-Z0-9]+/g, "_")).replace(/^_+|_+$/g, "");
}

const config = getBusConfig("pim-to-sql-agent");

const PIM_SOURCE_AGENTS = (process.env.PIM_PUBLISHER_AGENT_IDS ?? "demo-to-pim-agent,merode-to-pim-agent").split(",");
const IN_ARTEFACT        = "model.pim.created";
const OUTPUT_DIR          = process.env.SQL_OUTPUT_DIR ?? path.join(process.cwd(), "output");

const validatePim = makeValidator("pimuml-schema.json");

async function main() {
  console.log("[pim-to-sql] starting");
  console.log(`[pim-to-sql] output directory: ${OUTPUT_DIR}`);

  const bus = new BusClient(config);
  await bus.connect();
  console.log(`[pim-to-sql] connected to ${config.broker}:${config.port}`);

  const onPimReceived = async (rawModel: PimModel, timestamp: string) => {
    console.log(`[pim-to-sql] received model at ${timestamp}`);

    const { clean: pim } = extractMeta(rawModel);

    try {
      assertValid(validatePim, pim, "pimuml-schema.json");
    } catch (err) {
      console.error("[pim-to-sql] invalid input:", (err as Error).message);
      return;
    }

    let ddl: string;
    try {
      ddl = pimToSql(pim);
    } catch (err) {
      console.error("[pim-to-sql] mapping failed:", (err as Error).message);
      return;
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outFile = path.join(OUTPUT_DIR, `${slugify(pim.name)}.sql`);
    fs.writeFileSync(outFile, ddl);
    console.log(`[pim-to-sql] wrote ${outFile}`);
  };

  for (const agentId of PIM_SOURCE_AGENTS) {
    bus.subscribePimState(agentId, IN_ARTEFACT, onPimReceived);
    console.log(`[pim-to-sql] subscribed to PIM from "${agentId}"`);
  }

  console.log("[pim-to-sql] listening … (Ctrl+C to stop)");
}

if (require.main === module) {
  main().catch(err => {
    console.error("[pim-to-sql] unhandled error:", err);
    process.exit(1);
  });
}
