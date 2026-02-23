import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DuckDB is a native addon; don't bundle it so node-pre-gyp and optional deps aren't pulled in
  serverExternalPackages: ["duckdb"],
};

export default nextConfig;
