// Standalone test: runs pim-to-sql-agent's pimToSql() without needing an MQTT broker.
// Grows rule by rule alongside pim-to-sql-agent.ts (S1, S2, ...).
//
// Run:
//   npx ts-node tests/test-sql-agent.ts

import type { PimModel } from "../schemas/types";
import { pimToSql } from "../pim-to-sql-agent";

// S1: enumerations -> CREATE TYPE ... AS ENUM
const pim: PimModel = {
  name: "S1 smoke test",
  enumerations: [
    { name: "CarGroup", literals: ["economy", "compact", "luxury"] },
  ],
};

const ddl = pimToSql(pim);
console.log(ddl);

if (!ddl.includes(`CREATE TYPE car_group_enum AS ENUM ('economy', 'compact', 'luxury');`)) {
  console.error("FAIL: expected CREATE TYPE statement not found");
  process.exit(1);
}
console.log("S1 OK");
