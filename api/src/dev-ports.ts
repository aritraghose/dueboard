// Local ports under `alchemy dev`, fixed so they don't depend on which
// Worker starts first. Without them every Worker asks for 1337 and takes the
// next free port, so adding a Worker moved the website (from 1339 to 1340
// when the DomainWorker arrived) and Google refused the sign-in callback:
// its OAuth client lists `http://localhost:1339/api/auth/callback/google`.
// The website's port is strict (it fails instead of moving); the others
// matter only locally.

export const DEV_PORTS = {
  ApiWorker: 1337,
  DomainWorker: 1338,
  /** Google's dev redirect URI is on this port (README, "Google auth setup"). */
  Website: 1339,
  AgentWorker: 1340,
} as const;
