import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo para la imagen Docker. En Windows, sin permisos de administrador, la salida
  // "standalone" falla al crear enlaces simbólicos (EPERM) y no hace falta para `pnpm start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  transpilePackages: ["@luxalgo/journal-core", "@luxalgo/journal-importers"],
  serverExternalPackages: ["better-sqlite3"],
  // Runtime journal files belong on the user's disk, never in a deployable bundle.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "../../outputs/**/*", "../../.runtime-backup*/**/*"],
  },
};

export default nextConfig;
