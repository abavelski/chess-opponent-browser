import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  extractOpponentPgn,
  normalizePlayerName,
  parseArguments,
} from "../scripts/extract-opponent.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function tempFiles() {
  const directory = await mkdtemp(join(tmpdir(), "opponent-pack-"));
  temporaryDirectories.push(directory);
  return {
    inputPath: join(directory, "danbase.pgn"),
    outputPath: join(directory, "opponent.pgn"),
  };
}

const databasePgn = `[Event "Selected as White"]
[White "  NIELSEN,Jens   Ove Fries  "]
[Black "Other Player"]
[Result "1-0"]

1. e4 {A preserved comment
[White "This is inside a comment"]
still the same comment} e5 2. Nf3 Nc6 1-0

[Event "Selected by alias"]
[White "Another Player"]
[Black "Jens Ove Fries Nielsen"]
[CustomTag "keep-me"]
[Result "0-1"]

1. d4 d5 2. c4 (2. Nf3 Nf6) e6 0-1

[Event "Not selected"]
[White "Someone Else"]
[Black "Third Player"]
[Result "1/2-1/2"]

1. c4 e5 1/2-1/2
`;

describe("local opponent PGN extraction", () => {
  it("normalizes names the same basic way as the importer", () => {
    expect(normalizePlayerName("  NIELSEN,Jens   Ove Fries  ")).toBe(
      "nielsen,jens ove fries",
    );
    expect(normalizePlayerName("Ａｌｅｘｅｉ")).toBe("alexei");
  });

  it("extracts matching games incrementally and preserves their PGN text", async () => {
    const { inputPath, outputPath } = await tempFiles();
    await writeFile(inputPath, databasePgn, "utf8");

    const summary = await extractOpponentPgn({
      inputPath,
      outputPath,
      names: ["Nielsen,Jens Ove Fries", "Jens Ove Fries Nielsen"],
    });
    const output = await readFile(outputPath, "utf8");

    expect(summary).toMatchObject({ scanned: 3, matched: 2 });
    expect(output).toContain('[Event "Selected as White"]');
    expect(output).toContain('[White "  NIELSEN,Jens   Ove Fries  "]');
    expect(output).toContain('[White "This is inside a comment"]');
    expect(output).toContain('[CustomTag "keep-me"]');
    expect(output).toContain("2. c4 (2. Nf3 Nf6) e6 0-1");
    expect(output).not.toContain('[Event "Not selected"]');
  });

  it("does not include an alias unless it is explicitly supplied", async () => {
    const { inputPath, outputPath } = await tempFiles();
    await writeFile(inputPath, databasePgn, "utf8");

    const summary = await extractOpponentPgn({
      inputPath,
      outputPath,
      names: ["Nielsen,Jens Ove Fries"],
    });
    const output = await readFile(outputPath, "utf8");

    expect(summary.matched).toBe(1);
    expect(output).toContain('[Event "Selected as White"]');
    expect(output).not.toContain('[Event "Selected by alias"]');
  });

  it("ends comments whose closing brace follows a backslash", async () => {
    const { inputPath, outputPath } = await tempFiles();
    const pgnWithDanbaseAnnotation = String.raw`[Event "Annotated game"]
[White "Someone Else"]
[Black "Third Player"]
[Result "1-0"]

1. e4 {[%cal Re4e5] /\} e5 1-0

[Event "Target game"]
[White "Bavelski, Nikolaj"]
[Black "Other Player"]
[Result "0-1"]

1. d4 d5 0-1
`;
    await writeFile(inputPath, pgnWithDanbaseAnnotation, "utf8");

    const summary = await extractOpponentPgn({
      inputPath,
      outputPath,
      names: ["Bavelski, Nikolaj"],
    });
    const output = await readFile(outputPath, "utf8");

    expect(summary).toMatchObject({ scanned: 2, matched: 1 });
    expect(output).toContain('[Event "Target game"]');
    expect(output).not.toContain('[Event "Annotated game"]');
  });

  it("supports repeatable alias CLI arguments", () => {
    expect(
      parseArguments([
        "--input",
        "danbase.pgn",
        "--name",
        "Main Name",
        "--alias",
        "Alias One",
        "-a",
        "Alias Two",
        "--output",
        "pack.pgn",
      ]),
    ).toEqual({
      inputPath: "danbase.pgn",
      outputPath: "pack.pgn",
      names: ["Main Name", "Alias One", "Alias Two"],
      help: false,
    });
  });

  it("fails clearly when the input file is missing", async () => {
    const { inputPath, outputPath } = await tempFiles();

    await expect(
      extractOpponentPgn({ inputPath, outputPath, names: ["Missing Player"] }),
    ).rejects.toThrow("Input PGN cannot be read");
  });
});
