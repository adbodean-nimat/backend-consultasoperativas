import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../database/20260922_restore_unique_vehiculos_patente.sql",
  import.meta.url,
);

test("la migration restaura la unicidad de patente sin borrar datos", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /ADD CONSTRAINT uq_vehiculos_patente UNIQUE \(patente\)/i,
  );
  assert.match(migration, /HAVING COUNT\(\*\) > 1/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
});
