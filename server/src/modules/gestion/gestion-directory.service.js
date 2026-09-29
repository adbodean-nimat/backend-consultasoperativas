import LdapAuth from "ldapauth-fork";
import { getLdapServerConfig } from "../../ldap.config.js";
import { GestionError } from "./gestion.errors.js";
import { normalizeSam } from "./gestion-auth.repository.js";

const PROFILE_ATTRIBUTES = [
  "cn",
  "displayName",
  "givenName",
  "sn",
  "name",
  "mail",
  "sAMAccountName",
];

export async function findAdUser(username, { LdapClient = LdapAuth } = {}) {
  const normalized = normalizeSam(username);
  const ldap = new LdapClient({
    ...getLdapServerConfig(),
    includeRaw: false,
    searchAttributes: [...PROFILE_ATTRIBUTES],
  });

  // ldapauth-fork también informa el mismo error por callback. Este listener
  // evita un evento sin consumidor sin exponer datos internos del servidor.
  ldap.on("error", () => {});

  try {
    const user = await new Promise((resolve, reject) => {
      ldap._findUser(normalized, (error, result) => {
        if (error) reject(error);
        else resolve(result ?? null);
      });
    });
    if (!user) return null;
    return {
      cn: user.cn ?? null,
      displayName: user.displayName ?? null,
      givenName: user.givenName ?? null,
      sn: user.sn ?? null,
      name: user.name ?? user.cn ?? null,
      mail: user.mail ?? null,
      sAMAccountName: normalizeSam(user.sAMAccountName ?? normalized),
    };
  } catch (cause) {
    throw new GestionError("No se pudo consultar Active Directory", {
      status: 503,
      code: "GESTION_DIRECTORY_UNAVAILABLE",
      cause,
    });
  } finally {
    ldap.close(() => {});
  }
}
