import assert from "node:assert/strict";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55435");
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  for (const name of ["meterwerk_acceptance_rc", "meterwerk_upgrade_rc"]) {
    const exists = await client.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    assert.equal(
      exists.rowCount,
      0,
      "RC database already exists; never reset it implicitly",
    );
    await client.query(`CREATE DATABASE "${name}"`);
    console.log(`Created isolated database ${name}`);
  }
} finally {
  await client.end();
}
