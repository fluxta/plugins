const GITHUB_IDENTITY_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)$/;

export function isGitHubIdentity(value) {
  return GITHUB_IDENTITY_PATTERN.test(value);
}

export function normalizeGitHubIdentity(value) {
  return String(value).trim().replace(/^@/, "").toLowerCase();
}

export function formatGitHubIdentity(identity) {
  return `@${identity}`;
}

export function formatGitHubIdentities(identities) {
  return identities.map(formatGitHubIdentity).join(", ");
}
