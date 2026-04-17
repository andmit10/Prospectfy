import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry's webpack plugin only needs to run when a DSN is configured — otherwise
// it would attempt to upload source maps and fail in CI with missing auth tokens.
const hasSentry = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

export default hasSentry
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
      sourcemaps: { disable: true },
    })
  : nextConfig;
