import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the monorepo root .env so DATABASE_URL is shared with packages/db.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@drillforce/db", "@drillforce/shared"],
  experimental: {
    serverComponentsExternalPackages: ["postgres"],
  },
};

export default nextConfig;
