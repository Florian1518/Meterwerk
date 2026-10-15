/** Exact internal target shared by the operations CLI and Compose preflight.
 * @param {string} value
 */
export function assertStagingDatabase(value) {
  let database;
  try {
    database = new URL(value);
  } catch {
    throw new Error("Invalid staging DATABASE_URL");
  }
  if (
    database.protocol !== "postgresql:" ||
    database.hostname !== "db" ||
    database.port !== "5432" ||
    database.pathname !== "/meterwerk_staging" ||
    database.username !== "meterwerk_staging" ||
    database.search ||
    database.hash
  )
    throw new Error("Database must be the isolated internal staging target");
  return database;
}
