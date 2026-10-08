/** Canonical Session facts and read-version protection use the same bounded budget. */
export const DIRECTORY_SESSION_CACHE_LIMIT = 1000
export const MAX_RETAINED_AGENT_SESSIONS = 320
export const DIRECTORY_SESSION_TOTAL_LIMIT = DIRECTORY_SESSION_CACHE_LIMIT + MAX_RETAINED_AGENT_SESSIONS
