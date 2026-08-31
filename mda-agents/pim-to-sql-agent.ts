// pim-to-sql-agent
// Generates a runnable PostgreSQL DDL script from a pimUML model.
// Second PSM target alongside pim-to-mendix-agent - consumes the exact same
// model.pim.created artefact, no changes required to any existing agent or schema.

import type { PimModel } from "./schemas/types";

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
  name:     string; // snake_case SQL table name
  columns:  string[]; // rendered column definitions, in declaration order
  pkColumn: string; // name of this table's primary key column
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
    tables.set(dt.name, { name: toSnakeCase(dt.name), columns: [`  ${q("id")} SERIAL PRIMARY KEY`], pkColumn: "id" });
  }

  const dataTypeNames = new Set((pim.dataTypes ?? []).map(dt => dt.name));

  // S4/S6: classes -> CREATE TABLE with attribute columns
  for (const cls of pim.classes ?? []) {
    const columns: string[] = [];
    let pkColumn: string | undefined;

    for (const prop of cls.ownedAttributes ?? []) {
      if (prop.isDerived) continue; // S5: no OCL/computed-column equivalent, same as B-rule
      if (prop.type && dataTypeNames.has(prop.type)) {
        // S6: DataType-typed attribute -> deferred FK column, not an inline column
        const refTable = tables.get(prop.type);
        if (!refTable) continue;
        const fkCol = `${toSnakeCase(prop.name)}_id`;
        columns.push(`  ${q(fkCol)} INTEGER REFERENCES ${q(refTable.name)}(${q(refTable.pkColumn)})`);
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

    tables.set(cls.name, { name: toSnakeCase(cls.name), columns, pkColumn });
  }

  // S3: association classes -> junction table (own synthetic id + two FKs) + own attributes.
  // Analogous to B8 (entity + two associations); unlike a plain n:m association (S9) an
  // association class can carry its own attributes, so it always needs a real table.
  for (const ac of pim.associationClasses ?? []) {
    const columns: string[] = [`  ${q("id")} SERIAL PRIMARY KEY`];

    for (const end of ac.memberEnds) {
      const refTable = tables.get(end.type);
      if (!refTable) continue;
      const fkCol = `${toSnakeCase(end.name)}_id`;
      columns.push(`  ${q(fkCol)} INTEGER NOT NULL REFERENCES ${q(refTable.name)}(${q(refTable.pkColumn)})`);
    }
    for (const prop of ac.ownedAttributes ?? []) {
      if (prop.isDerived) continue;
      columns.push(`  ${q(toSnakeCase(prop.name))} ${sqlType(prop.type, enumNames)}`);
    }

    tables.set(ac.name, { name: toSnakeCase(ac.name), columns, pkColumn: "id" });
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
    for (const [end, refTable] of [[end0, table0], [end1, table1]] as const) {
      const fkCol = `${toSnakeCase(end.name)}_id`;
      columns.push(`  ${q(fkCol)} INTEGER NOT NULL REFERENCES ${q(refTable.name)}(${q(refTable.pkColumn)})`);
    }

    tables.set(assoc.name, { name: toSnakeCase(assoc.name), columns, pkColumn: "id" });
  }

  const createStatements = [...tables.values()].map(t => `CREATE TABLE ${q(t.name)} (\n${t.columns.join(",\n")}\n);`);

  const header = [
    `-- Generated by pim-to-sql-agent from pimUML model "${pim.name}"`,
    `-- Do not edit by hand.`,
  ].join("\n");

  return [header, ...typeStatements, ...createStatements].join("\n\n") + "\n";
}
