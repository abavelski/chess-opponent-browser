#!/usr/bin/env node

import { constants, createReadStream, createWriteStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import readline from "node:readline";

const tagLinePattern = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/;

export function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function unescapeTag(value) {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function updateBraceDepth(line, initialDepth) {
  let depth = initialDepth;

  for (const character of line) {
    if (character === "{") depth += 1;
    else if (character === "}" && depth > 0) depth -= 1;
  }

  return depth;
}

function gameText(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end -= 1;
  return lines.slice(0, end).join("\n");
}

export function gameMatchesPlayer(tags, normalizedNames) {
  const white = normalizePlayerName(tags.white);
  const black = normalizePlayerName(tags.black);
  return normalizedNames.has(white) || normalizedNames.has(black);
}

function parseTagLine(line) {
  const match = line.match(tagLinePattern);
  if (!match) return null;
  return { name: match[1].toLowerCase(), value: unescapeTag(match[2]) };
}

async function openOutput(outputPath) {
  const stream = createWriteStream(outputPath, { encoding: "utf8", flags: "w" });
  await new Promise((resolveOpen, rejectOpen) => {
    stream.once("open", resolveOpen);
    stream.once("error", rejectOpen);
  });
  return stream;
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return;
  await new Promise((resolveDrain, rejectDrain) => {
    stream.once("drain", resolveDrain);
    stream.once("error", rejectDrain);
  });
}

export async function extractOpponentPgn({ inputPath, outputPath, names }) {
  const resolvedInput = resolve(inputPath);
  const resolvedOutput = resolve(outputPath);
  if (resolvedInput === resolvedOutput) {
    throw new Error("Input and output must be different files.");
  }

  const normalizedNames = new Set(names.map(normalizePlayerName).filter(Boolean));
  if (normalizedNames.size === 0) {
    throw new Error("Provide a player name with --name.");
  }

  try {
    await access(resolvedInput, constants.R_OK);
  } catch {
    throw new Error(`Input PGN cannot be read: ${resolvedInput}`);
  }

  let output;
  try {
    output = await openOutput(resolvedOutput);
  } catch {
    throw new Error(`Output PGN cannot be written: ${resolvedOutput}`);
  }

  const input = createReadStream(resolvedInput, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  let currentLines = [];
  let tags = {};
  let sawTag = false;
  let sawMovetext = false;
  let braceDepth = 0;
  let scanned = 0;
  let matched = 0;

  const resetGame = () => {
    currentLines = [];
    tags = {};
    sawTag = false;
    sawMovetext = false;
    braceDepth = 0;
  };

  const finishGame = async () => {
    if (!sawTag) {
      resetGame();
      return;
    }

    scanned += 1;
    if (gameMatchesPlayer(tags, normalizedNames)) {
      const text = gameText(currentLines);
      if (text) {
        if (matched > 0) await writeChunk(output, "\n\n");
        await writeChunk(output, text);
        matched += 1;
      }
    }
    resetGame();
  };

  try {
    for await (const line of lines) {
      const parsedTag = parseTagLine(line);

      if (parsedTag && sawTag && sawMovetext && braceDepth === 0) {
        await finishGame();
      }

      if (!sawTag && currentLines.length === 0 && line === "") continue;

      currentLines.push(line);

      if (parsedTag && !sawMovetext) {
        sawTag = true;
        tags[parsedTag.name] = parsedTag.value;
        continue;
      }

      if (sawTag && line.trim() !== "") {
        sawMovetext = true;
        braceDepth = updateBraceDepth(line, braceDepth);
      }
    }

    await finishGame();
    if (matched > 0) await writeChunk(output, "\n");
  } finally {
    lines.close();
    input.destroy();
    await new Promise((resolveClose) => output.end(resolveClose));
  }

  return { scanned, matched, outputPath: resolvedOutput };
}

export async function extractOpponentPacks({ inputPath, opponents }) {
  const resolvedInput = resolve(inputPath);
  if (!Array.isArray(opponents) || opponents.length === 0) {
    throw new Error("Provide at least one opponent.");
  }

  try {
    await access(resolvedInput, constants.R_OK);
  } catch {
    throw new Error(`Input PGN cannot be read: ${resolvedInput}`);
  }

  const targets = opponents.map((opponent) => ({
    ...opponent,
    outputPath: resolve(opponent.outputPath),
    normalizedNames: new Set((opponent.names ?? [opponent.name]).map(normalizePlayerName).filter(Boolean)),
    matched: 0,
    output: null,
  }));
  if (targets.some((target) => target.outputPath === resolvedInput)) {
    throw new Error("Input and output must be different files.");
  }

  try {
    for (const target of targets) target.output = await openOutput(target.outputPath);
  } catch (error) {
    for (const target of targets) target.output?.destroy();
    throw error;
  }

  const input = createReadStream(resolvedInput, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let currentLines = [];
  let tags = {};
  let sawTag = false;
  let sawMovetext = false;
  let braceDepth = 0;
  let scanned = 0;

  const resetGame = () => {
    currentLines = [];
    tags = {};
    sawTag = false;
    sawMovetext = false;
    braceDepth = 0;
  };
  const finishGame = async () => {
    if (!sawTag) return resetGame();
    scanned += 1;
    const text = gameText(currentLines);
    if (text) {
      for (const target of targets) {
        if (!gameMatchesPlayer(tags, target.normalizedNames)) continue;
        if (target.matched > 0) await writeChunk(target.output, "\n\n");
        await writeChunk(target.output, text);
        target.matched += 1;
      }
    }
    resetGame();
  };

  try {
    for await (const line of lines) {
      const parsedTag = parseTagLine(line);
      if (parsedTag && sawTag && sawMovetext && braceDepth === 0) await finishGame();
      if (!sawTag && currentLines.length === 0 && line === "") continue;
      currentLines.push(line);
      if (parsedTag && !sawMovetext) {
        sawTag = true;
        tags[parsedTag.name] = parsedTag.value;
      } else if (sawTag && line.trim() !== "") {
        sawMovetext = true;
        braceDepth = updateBraceDepth(line, braceDepth);
      }
    }
    await finishGame();
    for (const target of targets) if (target.matched > 0) await writeChunk(target.output, "\n");
  } finally {
    lines.close();
    input.destroy();
    await Promise.all(targets.map((target) => new Promise((resolveClose) => target.output.end(resolveClose))));
  }

  return {
    scanned,
    opponents: targets.map(({ name, outputPath: targetPath, matched }) => ({ name, outputPath: targetPath, matched })),
  };
}

export function parseArguments(argv) {
  const result = { inputPath: "", outputPath: "", names: [], help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }

    if (["--input", "-i", "--output", "-o", "--name", "-n", "--alias", "-a"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;

      if (argument === "--input" || argument === "-i") result.inputPath = value;
      else if (argument === "--output" || argument === "-o") result.outputPath = value;
      else result.names.push(value);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return result;
}

function usage() {
  return `Extract one opponent's games from a large PGN.\n\nUsage:\n  npm run extract:opponent -- --input <database.pgn> --name <player> --output <pack.pgn> [--alias <name> ...]\n\nOptions:\n  -i, --input   Source PGN file\n  -n, --name    Primary player name (required)\n  -a, --alias   Additional exact normalized player spelling; repeatable\n  -o, --output  Destination PGN file\n  -h, --help    Show this help\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.inputPath) throw new Error("Provide an input PGN with --input.");
  if (!options.outputPath) throw new Error("Provide an output PGN with --output.");
  if (options.names.length === 0) throw new Error("Provide a player name with --name.");

  const summary = await extractOpponentPgn(options);
  process.stdout.write(
    `Scanned ${summary.scanned} games; matched ${summary.matched}; wrote ${summary.outputPath}\n`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`extract:opponent: ${message}\n`);
    process.exitCode = 1;
  });
}
