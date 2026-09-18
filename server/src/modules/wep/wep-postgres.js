import pg from "pg";

const { Pool } = pg;

export function buildWepPostgresConfig(env = process.env) {
  const configuredPort = env.WEP_PG_PORT;
  const port = configuredPort ? Number(configuredPort) : 5432;

  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new Error("WEP_PG_PORT debe ser un puerto válido");
  }

  return {
    host: env.WEP_PG_HOST,
    port,
    database: env.WEP_PG_DATABASE,
    user: env.WEP_PG_USER,
    password: env.WEP_PG_PASSWORD,
    ssl:
      String(env.WEP_PG_SSL).toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : false,
    application_name: "restapi-nodejs-wep-sync",
  };
}

export const wepPostgresPool = new Pool(buildWepPostgresConfig());

export default wepPostgresPool;
