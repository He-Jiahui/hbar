/** Optional upstream integrations are resolved only when explicitly used, as in the existing standalone build. */
export const RUNTIME_BUNDLE_EXTERNALS = [
  '@aws-sdk/client-s3',
  'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
  'chromium-bidi/lib/cjs/cdp/CdpConnection',
] as const
