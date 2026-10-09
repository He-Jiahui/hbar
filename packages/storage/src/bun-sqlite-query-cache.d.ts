import 'bun:sqlite'

declare module 'bun:sqlite' {
  interface Database {
    /**
     * Bun 1.4.0 exports this public runtime method, but its bundled SQLite
     * declaration omits it. Keep this single-method compatibility declaration
     * beside the adapter; maintenance tests verify the actual runtime behavior.
     * https://github.com/oven-sh/bun/blob/bun-v1.4.0/src/js/bun/sqlite.ts#L476
     */
    clearQueryCache(): void
  }
}
