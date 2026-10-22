import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        // Lichess publishes extensionless ESM imports that need Vite resolution in tests.
        inline: [
          "@lichess-org/pgn-viewer",
          "@lichess-org/chessground",
          "chessops",
          "@badrap/result",
          "snabbdom",
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
