import type {
  StructuredMove,
  StructuredMovesDocument,
  StructuredVariation,
} from "@/lib/games/viewer";

import {
  cloneImportPosition,
  createInitialPosition,
  resolveSanMove,
  type ImportChessPosition,
} from "./chess";

export const MAX_PGN_BYTES = 3 * 1024 * 1024;
export const MAX_SOURCE_LABEL_LENGTH = 120;

export type PgnPreviewGame = {
  index: number;
  white: string;
  black: string;
  whiteRating: number | null;
  blackRating: number | null;
  whiteFideId: string | null;
  blackFideId: string | null;
  playedOn: string | null;
  dateLabel: string | null;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  event: string | null;
  site: string | null;
  round: string | null;
  eco: string | null;
  opening: string | null;
  tags: Record<string, string>;
  originalPgn: string;
  structuredMoves: StructuredMovesDocument;
};

export type PgnPreviewError = {
  index: number;
  message: string;
};

export type PgnPreview = {
  gamesFound: number;
  games: PgnPreviewGame[];
  errors: PgnPreviewError[];
};

export type UploadValidation =
  | { ok: true; sourceLabel: string }
  | { ok: false; message: string };

type Token =
  | { type: "san"; value: string }
  | { type: "comment"; value: string }
  | { type: "variationStart" }
  | { type: "variationEnd" }
  | { type: "result"; value: string };

type Segment = {
  source: string;
  tagsText: string;
  movesText: string;
};

type ParsedLine = {
  moves: StructuredMove[];
  nextIndex: number;
  result: string | null;
};

const resultValues = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
const tagLinePattern = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/;

function normalizeNewlines(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function displayError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "The game could not be parsed.";
}

function cleanComment(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendComment(move: StructuredMove, comment: string) {
  const cleaned = cleanComment(comment);
  if (!cleaned) return;
  move.comment = move.comment ? `${move.comment} ${cleaned}` : cleaned;
}

function unescapeTag(value: string) {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function tagValue(tags: Record<string, string>, names: string[]) {
  const lowerNames = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(tags)) {
    if (lowerNames.has(key.toLowerCase())) return value.trim() || null;
  }
  return null;
}

function parseRating(value: string | null) {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const rating = Number(value);
  return rating >= 1 && rating <= 4000 ? rating : null;
}

function parsePlayedOn(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/);
  if (!match || match[2] === "??" || match[3] === "??") return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

function validateResult(value: string | null) {
  return value && resultValues.has(value)
    ? (value as PgnPreviewGame["result"])
    : ("*" as const);
}

function looksBinary(value: string) {
  if (value.includes("\u0000")) return true;
  const sample = value.slice(0, 8192);
  if (!sample) return false;
  let suspicious = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (code < 32 && char !== "\n" && char !== "\r" && char !== "\t") suspicious += 1;
  }
  return suspicious / sample.length > 0.01;
}

export function validatePgnUploadMetadata({
  filename,
  size,
  sourceLabel,
}: {
  filename: string;
  size: number;
  sourceLabel: string;
}): UploadValidation {
  const source = sourceLabel.trim() || "Manual";
  if (source.length > MAX_SOURCE_LABEL_LENGTH) {
    return { ok: false, message: `Source label must be ${MAX_SOURCE_LABEL_LENGTH} characters or fewer.` };
  }
  if (!filename.toLowerCase().endsWith(".pgn")) {
    return { ok: false, message: "Choose a .pgn file." };
  }
  if (size <= 0) {
    return { ok: false, message: "The PGN file is empty." };
  }
  if (size > MAX_PGN_BYTES) {
    return { ok: false, message: "The PGN file is too large. Maximum size is 3 MB." };
  }
  return { ok: true, sourceLabel: source };
}

function segmentGames(input: string): Segment[] {
  const normalized = normalizeNewlines(input);
  const lines = normalized.split(/(?<=\n)/);
  const segments: Segment[] = [];
  let start = 0;
  let offset = 0;
  let seenMoves = false;
  let seenTag = false;

  for (const lineWithEnding of lines) {
    const line = lineWithEnding.endsWith("\n") ? lineWithEnding.slice(0, -1) : lineWithEnding;
    const isTag = tagLinePattern.test(line);
    const trimmed = line.trim();

    if (isTag && seenMoves) {
      const source = normalized.slice(start, offset);
      const parsed = splitTagsAndMoves(source);
      if (parsed) segments.push(parsed);
      start = offset;
      seenMoves = false;
      seenTag = true;
    } else {
      if (isTag) seenTag = true;
      if (seenTag && trimmed && !isTag && !trimmed.startsWith("%")) seenMoves = true;
    }

    offset += lineWithEnding.length;
  }

  const tail = normalized.slice(start);
  const parsedTail = splitTagsAndMoves(tail);
  if (parsedTail) segments.push(parsedTail);
  return segments;
}

function splitTagsAndMoves(source: string): Segment | null {
  if (!source.trim()) return null;
  const lines = source.split("\n");
  let sawTag = false;
  let lastTagLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (tagLinePattern.test(line)) {
      sawTag = true;
      lastTagLine = index;
      continue;
    }
    if (!line.trim() || line.trim().startsWith("%")) continue;
    if (sawTag) break;
  }

  if (!sawTag) {
    return { source, tagsText: "", movesText: source };
  }

  return {
    source,
    tagsText: lines.slice(0, lastTagLine + 1).join("\n"),
    movesText: lines.slice(lastTagLine + 1).join("\n"),
  };
}

function parseTags(tagsText: string) {
  const tags: Record<string, string> = {};
  for (const line of tagsText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%")) continue;
    const match = line.match(tagLinePattern);
    if (!match) throw new Error("A PGN tag pair is malformed.");
    tags[match[1]] = unescapeTag(match[2]);
  }
  return tags;
}

function tokenizeMovetext(input: string) {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "%" && (index === 0 || input[index - 1] === "\n")) {
      while (index < input.length && input[index] !== "\n") index += 1;
      continue;
    }
    if (char === "{") {
      const end = input.indexOf("}", index + 1);
      if (end < 0) throw new Error("A brace comment is not closed.");
      tokens.push({ type: "comment", value: input.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (char === ";") {
      let end = input.indexOf("\n", index + 1);
      if (end < 0) end = input.length;
      tokens.push({ type: "comment", value: input.slice(index + 1, end) });
      index = end;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "variationStart" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "variationEnd" });
      index += 1;
      continue;
    }
    if (char === "$") {
      index += 1;
      while (index < input.length && /\d/.test(input[index])) index += 1;
      continue;
    }

    let end = index;
    while (end < input.length && !/[\s{}();]/.test(input[end])) end += 1;
    const raw = input.slice(index, end).trim();
    index = end;
    if (!raw) continue;

    if (resultValues.has(raw)) {
      tokens.push({ type: "result", value: raw });
      continue;
    }
    if (/^\d+\.(?:\.\.)?$/.test(raw) || /^\d+\.\.\.$/.test(raw)) continue;
    if (/^\d+\.(?:\.\.)?[^.]/.test(raw)) {
      const san = raw.replace(/^\d+\.(?:\.\.)?/, "");
      if (san) tokens.push({ type: "san", value: san });
      continue;
    }
    if (/^[!?]+$/.test(raw)) continue;
    tokens.push({ type: "san", value: raw });
  }

  return tokens;
}

function parseLine(
  tokens: Token[],
  startIndex: number,
  startPosition: ImportChessPosition,
  inVariation: boolean,
): ParsedLine {
  const moves: StructuredMove[] = [];
  const beforePositions: ImportChessPosition[] = [];
  let index = startIndex;
  let position = cloneImportPosition(startPosition);
  let pendingComment = "";
  let result: string | null = null;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "variationEnd") {
      if (!inVariation) throw new Error("Unexpected closing variation parenthesis.");
      return { moves, nextIndex: index + 1, result };
    }
    if (token.type === "result") {
      result = token.value;
      index += 1;
      if (inVariation) continue;
      break;
    }
    if (token.type === "comment") {
      const cleaned = cleanComment(token.value);
      if (moves.length > 0) appendComment(moves[moves.length - 1], cleaned);
      else pendingComment = [pendingComment, cleaned].filter(Boolean).join(" ");
      index += 1;
      continue;
    }
    if (token.type === "variationStart") {
      if (moves.length === 0) throw new Error("A variation appears before a move to branch from.");
      const parentIndex = moves.length - 1;
      const branchPosition = beforePositions[parentIndex];
      const variation = parseLine(tokens, index + 1, branchPosition, true);
      const structuredVariation: StructuredVariation = { moves: variation.moves };
      moves[parentIndex].variations = [...(moves[parentIndex].variations ?? []), structuredVariation];
      index = variation.nextIndex;
      continue;
    }

    const before = cloneImportPosition(position);
    const resolved = resolveSanMove(position, token.value);
    const move: StructuredMove = { san: token.value, uci: resolved.uci };
    if (pendingComment) {
      move.comment = pendingComment;
      pendingComment = "";
    }
    beforePositions.push(before);
    moves.push(move);
    position = resolved.position;
    index += 1;
  }

  if (inVariation) throw new Error("A variation is not closed.");
  return { moves, nextIndex: index, result };
}

function parseSegment(segment: Segment, index: number): PgnPreviewGame {
  const tags = parseTags(segment.tagsText);
  const white = tagValue(tags, ["White"]);
  const black = tagValue(tags, ["Black"]);
  if (!white || !black) throw new Error("White and Black tags are required.");
  if (tagValue(tags, ["SetUp"]) === "1" || tagValue(tags, ["FEN"])) {
    throw new Error("Custom starting positions are not supported in imports yet.");
  }

  const tokens = tokenizeMovetext(segment.movesText);
  if (tokens.filter((token) => token.type === "san").length === 0) {
    throw new Error("No moves were found in this game.");
  }
  const parsedLine = parseLine(tokens, 0, createInitialPosition(), false);
  if (parsedLine.moves.length === 0) throw new Error("No playable moves were found in this game.");

  const tagResult = tagValue(tags, ["Result"]);
  const result = validateResult(tagResult ?? parsedLine.result);
  const dateLabel = tagValue(tags, ["Date"]);

  return {
    index,
    white,
    black,
    whiteRating: parseRating(tagValue(tags, ["WhiteElo", "WhiteRating"])),
    blackRating: parseRating(tagValue(tags, ["BlackElo", "BlackRating"])),
    whiteFideId: tagValue(tags, ["WhiteFideId", "WhiteFideID", "WhiteFIDEId", "WhiteFIDEID"]),
    blackFideId: tagValue(tags, ["BlackFideId", "BlackFideID", "BlackFIDEId", "BlackFIDEID"]),
    playedOn: parsePlayedOn(dateLabel),
    dateLabel,
    result,
    event: tagValue(tags, ["Event"]),
    site: tagValue(tags, ["Site"]),
    round: tagValue(tags, ["Round"]),
    eco: tagValue(tags, ["ECO"]),
    opening: tagValue(tags, ["Opening"]),
    tags,
    originalPgn: segment.source,
    structuredMoves: { version: 1, mainline: parsedLine.moves },
  };
}

export function parsePgnPreview(input: string): PgnPreview {
  if (!input.trim()) throw new Error("The PGN file is empty.");
  if (looksBinary(input)) throw new Error("The selected file does not look like a text PGN file.");

  const segments = segmentGames(input);
  if (segments.length === 0) throw new Error("No PGN games were found.");

  const games: PgnPreviewGame[] = [];
  const errors: PgnPreviewError[] = [];
  for (const [offset, segment] of segments.entries()) {
    const gameIndex = offset + 1;
    try {
      games.push(parseSegment(segment, gameIndex));
    } catch (error) {
      errors.push({ index: gameIndex, message: displayError(error) });
    }
  }

  return { gamesFound: segments.length, games, errors };
}
