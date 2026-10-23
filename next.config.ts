import type { NextConfig } from "next";
import path from "node:path";

const desktop = process.env.CHESS_DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  ...(desktop ? {
    output: "standalone",
    distDir: ".next-desktop",
    typescript: { tsconfigPath: "tsconfig.desktop.json" },
    webpack(config, { webpack }) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /^@\/lib\/db$/,
        path.resolve("desktop/db.ts"),
      ));
      return config;
    },
  } satisfies Partial<NextConfig> : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
    proxyClientMaxBodySize: "4mb",
  },
};

export default nextConfig;
