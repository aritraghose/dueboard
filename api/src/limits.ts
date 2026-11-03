// The ApiWorker's Rate Limiting bindings (architecture.md §9), in one place
// so they're easy to tune. Counting is approximate and per Cloudflare
// location: abuse protection, not exact quotas. Each `namespaceId` must be
// unique within the Cloudflare account, and the binding only counts per 10
// or 60 seconds, so daily caps are counted in Postgres by the services.
// The website's `AUTH_RATE_LIMIT` (1003) lives in `web/alchemy.run.ts`.

/** Every authenticated RPC, per user. */
export const RPC_LIMIT = { namespaceId: 1004, simple: { limit: 120, period: 60 } } as const;

/**
 * Sending connection requests, per user: a burst limit. The 20-a-day cap
 * (`CONNECTION_REQUESTS_PER_DAY`) is counted from `connection_requests`.
 */
export const CONNECTION_REQUEST_LIMIT = { namespaceId: 1006, simple: { limit: 5, period: 60 } } as const;

/** Public reads (`PublicRpcs`) by logged-out visitors, per IP. */
export const PUBLIC_READ_LIMIT = { namespaceId: 1008, simple: { limit: 60, period: 60 } } as const;

/** People search, per user. Searches are debounced as the user types. */
export const PEOPLE_SEARCH_LIMIT = { namespaceId: 1011, simple: { limit: 30, period: 60 } } as const;
