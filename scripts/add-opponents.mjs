#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { extractOpponentPgn } from "./extract-opponent.mjs";

const DEFAULT_URL = "https://chess-opponent-browser.vercel.app";
const DEFAULT_INPUT = "~/Downloads/danbase.pgn";

export function expandHome(filePath) {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/")) return join(homedir(), filePath.slice(2));
  return filePath;
}

export function packFilename(name) {
  const normalized = String(name ?? "").normalize("NFKC").trim().toLowerCase();
  const slug =
    normalized
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "opponent";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  return `${slug}-${hash}.pgn`;
}

export function parseNameList(text) {
  const names = [];
  const seen = new Set();

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const name = line.trim();
    if (!name || name.startsWith("#")) continue;
    const key = name.normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export function parseArguments(argv) {
  const options = {
    inputPath: DEFAULT_INPUT,
    namesFile: "",
    baseUrl: process.env.OPPONENT_BROWSER_URL || DEFAULT_URL,
    packsDir: "packs",
    positional: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (["--input", "-i", "--file", "-f", "--url", "-u", "--packs-dir"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;

      if (argument === "--input" || argument === "-i") options.inputPath = value;
      else if (argument === "--file" || argument === "-f") options.namesFile = value;
      else if (argument === "--url" || argument === "-u") options.baseUrl = value;
      else options.packsDir = value;
      continue;
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    options.positional.push(argument);
  }

  return options;
}

export async function resolveNames(options) {
  if (options.namesFile) {
    const filePath = resolve(expandHome(options.namesFile));
    const contents = await readFile(filePath, "utf8");
    return parseNameList(contents);
  }

  const joined = options.positional.join(" ").trim();
  return joined ? [joined] : [];
}

function absoluteFromCwd(filePath) {
  const expanded = expandHome(filePath);
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

async function uploadPack({ baseUrl, name, packPath }) {
  const rawPgn = await readFile(packPath);
  const formData = new FormData();
  formData.set("name", name);
  formData.set(
    "pgnFile",
    new Blob([rawPgn], { type: "application/x-chess-pgn" }),
    basename(packPath),
  );

  const endpoint = new URL("/api/admin/opponents/import", baseUrl).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Upload failed with HTTP ${response.status}.`);
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || `Upload failed with HTTP ${response.status}.`);
  }

  return payload;
}

export async function addOpponent({ inputPath, packsDir, baseUrl, name }) {
  const outputDirectory = absoluteFromCwd(packsDir);
  await mkdir(outputDirectory, { recursive: true });

  const outputPath = join(outputDirectory, packFilename(name));
  const extraction = await extractOpponentPgn({
    inputPath: absoluteFromCwd(inputPath),
    outputPath,
    names: [name],
  });

  if (extraction.matched === 0) {
    return {
      name,
      status: "not-found",
      matched: 0,
      outputPath,
      message: "No matching games were found in Danbase.",
    };
  }

  const uploaded = await uploadPack({
    baseUrl,
    name,
    packPath: outputPath,
  });

  return {
    name,
    status: uploaded.alreadyUpToDate ? "up-to-date" : "uploaded",
    matched: extraction.matched,
    outputPath,
    uploaded,
  };
}

function usage() {
  return `Extract Danbase games and upload opponents to the active tournament.

Usage:
  npm run add-opponent -- "Opponent Name"
  npm run add-opponents -- ./opponents.txt

Options:
  -i, --input <path>      Danbase PGN (default: ~/Downloads/danbase.pgn)
  -f, --file <path>       Text file with one opponent name per line
  -u, --url <url>         App URL (default: OPPONENT_BROWSER_URL or ${DEFAULT_URL})
      --packs-dir <path>  Extracted packs folder (default: ./packs)
  -h, --help              Show help

Blank lines and lines starting with # are ignored in names files.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);

  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const names = await resolveNames(options);
  if (names.length === 0) {
    throw new Error("Provide an opponent name or a --file with one name per line.");
  }

  process.stdout.write(
    `Danbase: ${absoluteFromCwd(options.inputPath)}\nPacks: ${absoluteFromCwd(options.packsDir)}\nTarget: ${options.baseUrl}\n\n`,
  );

  let failures = 0;

  for (const [index, name] of names.entries()) {
    process.stdout.write(`[${index + 1}/${names.length}] ${name}\n`);

    try {
      const result = await addOpponent({
        inputPath: options.inputPath,
        packsDir: options.packsDir,
        baseUrl: options.baseUrl,
        name,
      });

      if (result.status === "not-found") {
        failures += 1;
        process.stdout.write(`  no games found; kept ${result.outputPath}\n`);
        continue;
      }

      const imported = result.uploaded.import.importedCount;
      const duplicates = result.uploaded.import.duplicateCount;
      const visible = result.uploaded.opponent?.visibleGameCount ?? 0;
      const label = result.status === "up-to-date" ? "already up to date" : "uploaded";
      process.stdout.write(
        `  ${label}: ${result.matched} extracted, ${imported} new, ${duplicates} duplicate, ${visible} visible\n  pack: ${result.outputPath}\n`,
      );
    } catch (error) {
      failures += 1;
      process.stderr.write(
        `  failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    process.stderr.write(`\nCompleted with ${failures} failed/not-found opponent(s).\n`);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(
      `add-opponent: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
