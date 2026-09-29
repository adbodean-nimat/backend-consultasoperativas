export function getLdapServerConfig() {
  return {
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_bindDN,
    bindCredentials: process.env.LDAP_bindCredentials,
    searchBase: process.env.LDAP_searchBase,
    searchFilter: process.env.LDAP_searchFilter,
    includeRaw: true,
  };
}
