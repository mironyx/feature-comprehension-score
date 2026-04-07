import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // pino + thread-stream use worker threads that webpack mis-bundles in dev mode
  // (results in `Cannot find module .next/server/vendor-chunks/lib/worker.js`).
  // Mark them external so Node resolves them from node_modules at runtime.
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
