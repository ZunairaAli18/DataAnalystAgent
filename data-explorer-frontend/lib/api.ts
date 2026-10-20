// Base URL of the analytics_agent backend.
// NEXT_PUBLIC_* vars are inlined at build time, so production builds must set
// NEXT_PUBLIC_API_URL when building (next.config.mjs fails the build otherwise).
// The localhost fallback only exists in `next dev`.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")
