import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Bundle the small, single-threaded build with the site. No cross-origin
// isolation headers or third-party engine CDN are required.
const source = resolve("node_modules/stockfish");
const destination = resolve("public/stockfish");
mkdirSync(destination, { recursive: true });

for (const file of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  copyFileSync(resolve(source, "bin", file), resolve(destination, file));
}
copyFileSync(resolve(source, "Copying.txt"), resolve(destination, "Copying.txt"));
console.log("Bundled Stockfish 19 Lite (single-threaded) browser worker and license.");
