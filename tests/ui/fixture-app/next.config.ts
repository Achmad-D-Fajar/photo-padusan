import path from "node:path";
import type { NextConfig } from "next";

// Separate local test app; never part of src/app or the production build.
const config: NextConfig = { turbopack: { root: path.resolve(__dirname, "../../..") } };
export default config;
