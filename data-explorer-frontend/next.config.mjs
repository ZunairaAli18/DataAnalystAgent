import { PHASE_PRODUCTION_BUILD } from "next/constants.js"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default function config(phase) {
  // NEXT_PUBLIC_API_URL is inlined at build time; without it a production
  // bundle would have no backend URL (the localhost fallback is dev-only).
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_API_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be set for production builds (e.g. https://your-backend.example.com)"
    )
  }
  return nextConfig
}
