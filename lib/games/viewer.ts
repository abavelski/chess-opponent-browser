export type StructuredMove = {
  san: string;
  uci: string;
  comment?: string;
  variations?: StructuredVariation[];
};

export type StructuredVariation = {
  moves: StructuredMove[];
};

export type StructuredMovesDocument = {
  version: 1;
  mainline: StructuredMove[];
};

export type ReplayMove = {
  id: string;
  san: string;
  uci: string;
  comment: string | null;
  fen: string;
  moveNumber: number;
  side: "white" | "black";
  variationLineIds: string[];
};

export type ReplayLine = {
  id: string;
  parentLineId: string | null;
  parentMoveIndex: number | null;
  anchorFen: string;
  startPly: number;
  moves: ReplayMove[];
};

export type ReplayDocument = {
  version: 1;
  mainLineId: "main";
  initialFen: string;
  lines: ReplayLine[];
};

export type ReplaySelection = {
  lineId: string;
  index: number;
};

export type BoardSquare = {
  square: string;
  piece: string | null;
};

type Position = {
  board: Array<string | null>;
  activeColor: "w" | "b";
  castling: string;
  enPassant: string | null;
  halfmove: number;
  fullmove: number;
};

const files = "abcdefgh";
const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const piecePattern = /^[prnbqkPRNBQK]$/;
const maxMoveCount = 5000;
const maxVariationDepth = 32;

export const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function squareIndex(square: string) {
  const fileIndex = files.indexOf(square[0]);
  const rank = Number(square[1]);
  if (fileIndex < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
    return -1;
  }
  return (8 - rank) * 8 + fileIndex;
}

function squareName(index: number) {
  const rank = 8 - Math.floor(index / 8);
  const file = files[index % 8];
  return `${file}${rank}`;
}

function pieceColor(piece: string) {
  return piece === piece.toUpperCase() ? "w" : "b";
}

function initialPosition(): Position {
  const ranks = [
    "rnbqkbnr",
    "pppppppp",
    "........",
    "........",
    "........",
    "........",
    "PPPPPPPP",
    "RNBQKBNR",
  ];

  return {
    board: ranks.flatMap((rank) => [...rank].map((piece) => (piece === "." ? null : piece))),
    activeColor: "w",
    castling: "KQkq",
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

function clonePosition(position: Position): Position {
  return { ...position, board: [...position.board] };
}

function removeCastlingRight(castling: string, right: string) {
  return castling.replace(right, "");
}

function applyUciMove(position: Position, uci: string): Position {
  if (!uciPattern.test(uci)) {
    throw new Error("Invalid UCI move format.");
  }

  const fromSquare = uci.slice(0, 2);
  const toSquare = uci.slice(2, 4);
  const promotion = uci[4];
  const from = squareIndex(fromSquare);
  const to = squareIndex(toSquare);
  const next = clonePosition(position);
  const movingPiece = next.board[from];
  const targetPiece = next.board[to];

  if (!movingPiece || !piecePattern.test(movingPiece)) {
    throw new Error("Move source does not contain a piece.");
  }
  if (pieceColor(movingPiece) !== next.activeColor) {
    throw new Error("Move source belongs to the wrong side.");
  }
  if (targetPiece && pieceColor(targetPiece) === next.activeColor) {
    throw new Error("Move target contains a friendly piece.");
  }

  const isPawn = movingPiece.toLowerCase() === "p";
  const isKing = movingPiece.toLowerCase() === "k";
  const fromFile = from % 8;
  const toFile = to % 8;
  const fromRank = 8 - Math.floor(from / 8);
  const toRank = 8 - Math.floor(to / 8);
  let capture = Boolean(targetPiece);

  if (isPawn && fromFile !== toFile && !targetPiece) {
    if (next.enPassant !== toSquare) {
      throw new Error("Invalid en passant move.");
    }
    const capturedPawnIndex = squareIndex(`${toSquare[0]}${fromRank}`);
    const capturedPawn = next.board[capturedPawnIndex];
    if (!capturedPawn || capturedPawn.toLowerCase() !== "p" || pieceColor(capturedPawn) === next.activeColor) {
      throw new Error("Invalid en passant capture.");
    }
    next.board[capturedPawnIndex] = null;
    capture = true;
  }

  next.board[from] = null;

  if (isKing && Math.abs(fromFile - toFile) === 2) {
    const rank = fromRank;
    const kingSide = toFile > fromFile;
    const rookFromSquare = `${kingSide ? "h" : "a"}${rank}`;
    const rookToSquare = `${kingSide ? "f" : "d"}${rank}`;
    const rookFrom = squareIndex(rookFromSquare);
    const rookTo = squareIndex(rookToSquare);
    const rook = next.board[rookFrom];
    const expectedRook = next.activeColor === "w" ? "R" : "r";
    if (rook !== expectedRook) {
      throw new Error("Invalid castling move.");
    }
    next.board[rookFrom] = null;
    next.board[rookTo] = rook;
  }

  let placedPiece = movingPiece;
  if (promotion) {
    if (!isPawn || (toRank !== 1 && toRank !== 8)) {
      throw new Error("Invalid promotion move.");
    }
    placedPiece = next.activeColor === "w" ? promotion.toUpperCase() : promotion;
  } else if (isPawn && (toRank === 1 || toRank === 8)) {
    throw new Error("Pawn reaching the final rank requires promotion.");
  }

  next.board[to] = placedPiece;

  if (movingPiece === "K") {
    next.castling = removeCastlingRight(removeCastlingRight(next.castling, "K"), "Q");
  } else if (movingPiece === "k") {
    next.castling = removeCastlingRight(removeCastlingRight(next.castling, "k"), "q");
  } else if (movingPiece === "R" && fromSquare === "a1") {
    next.castling = removeCastlingRight(next.castling, "Q");
  } else if (movingPiece === "R" && fromSquare === "h1") {
    next.castling = removeCastlingRight(next.castling, "K");
  } else if (movingPiece === "r" && fromSquare === "a8") {
    next.castling = removeCastlingRight(next.castling, "q");
  } else if (movingPiece === "r" && fromSquare === "h8") {
    next.castling = removeCastlingRight(next.castling, "k");
  }

  if (targetPiece === "R" && toSquare === "a1") next.castling = removeCastlingRight(next.castling, "Q");
  if (targetPiece === "R" && toSquare === "h1") next.castling = removeCastlingRight(next.castling, "K");
  if (targetPiece === "r" && toSquare === "a8") next.castling = removeCastlingRight(next.castling, "q");
  if (targetPiece === "r" && toSquare === "h8") next.castling = removeCastlingRight(next.castling, "k");

  next.enPassant = null;
  if (isPawn && Math.abs(toRank - fromRank) === 2) {
    const middleRank = (fromRank + toRank) / 2;
    next.enPassant = `${fromSquare[0]}${middleRank}`;
  }

  next.halfmove = isPawn || capture ? 0 : next.halfmove + 1;
  if (next.activeColor === "b") next.fullmove += 1;
  next.activeColor = next.activeColor === "w" ? "b" : "w";

  return next;
}

function positionToFen(position: Position) {
  const rows: string[] = [];

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let row = "";
    let empty = 0;
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const piece = position.board[rankIndex * 8 + fileIndex];
      if (!piece) {
        empty += 1;
      } else {
        if (empty > 0) row += String(empty);
        row += piece;
        empty = 0;
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }

  return `${rows.join("/")} ${position.activeColor} ${position.castling || "-"} ${position.enPassant ?? "-"} ${position.halfmove} ${position.fullmove}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMove(
  value: unknown,
  depth: number,
  counter: { value: number },
): StructuredMove | null {
  if (!isRecord(value) || depth > maxVariationDepth) return null;
  if (typeof value.san !== "string" || value.san.trim() === "") return null;
  if (typeof value.uci !== "string" || !uciPattern.test(value.uci)) return null;
  if (value.comment !== undefined && typeof value.comment !== "string") return null;

  counter.value += 1;
  if (counter.value > maxMoveCount) return null;

  let variations: StructuredVariation[] | undefined;
  if (value.variations !== undefined) {
    if (!Array.isArray(value.variations)) return null;
    variations = [];
    for (const variationValue of value.variations) {
      if (!isRecord(variationValue) || !Array.isArray(variationValue.moves)) return null;
      const moves: StructuredMove[] = [];
      for (const moveValue of variationValue.moves) {
        const move = parseMove(moveValue, depth + 1, counter);
        if (!move) return null;
        moves.push(move);
      }
      variations.push({ moves });
    }
  }

  return {
    san: value.san,
    uci: value.uci,
    ...(value.comment !== undefined ? { comment: value.comment } : {}),
    ...(variations !== undefined ? { variations } : {}),
  };
}

export function parseStructuredMoves(value: unknown): StructuredMovesDocument | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.mainline) || value.mainline.length === 0) {
    return null;
  }

  const counter = { value: 0 };
  const mainline: StructuredMove[] = [];
  for (const moveValue of value.mainline) {
    const move = parseMove(moveValue, 0, counter);
    if (!move) return null;
    mainline.push(move);
  }

  return { version: 1, mainline };
}

export function buildReplayDocument(value: unknown): ReplayDocument | null {
  const structured = parseStructuredMoves(value);
  if (!structured) return null;

  const lines: ReplayLine[] = [];

  function compileLine(
    moves: StructuredMove[],
    startPosition: Position,
    id: string,
    parentLineId: string | null,
    parentMoveIndex: number | null,
    startPly: number,
  ) {
    const line: ReplayLine = {
      id,
      parentLineId,
      parentMoveIndex,
      anchorFen: positionToFen(startPosition),
      startPly,
      moves: [],
    };
    lines.push(line);

    let position = startPosition;
    for (const [index, move] of moves.entries()) {
      const beforeMove = position;
      position = applyUciMove(position, move.uci);
      const ply = startPly + index;
      const replayMove: ReplayMove = {
        id: `${id}:${index}`,
        san: move.san,
        uci: move.uci,
        comment: move.comment ?? null,
        fen: positionToFen(position),
        moveNumber: Math.floor(ply / 2) + 1,
        side: ply % 2 === 0 ? "white" : "black",
        variationLineIds: [],
      };
      line.moves.push(replayMove);

      for (const [variationIndex, variation] of (move.variations ?? []).entries()) {
        const variationId = `${id}.${index}.v${variationIndex}`;
        replayMove.variationLineIds.push(variationId);
        compileLine(
          variation.moves,
          beforeMove,
          variationId,
          id,
          index,
          ply,
        );
      }
    }
  }

  try {
    compileLine(structured.mainline, initialPosition(), "main", null, null, 0);
  } catch {
    return null;
  }

  return {
    version: 1,
    mainLineId: "main",
    initialFen,
    lines,
  };
}

export function findReplayLine(document: ReplayDocument, lineId: string) {
  return document.lines.find((line) => line.id === lineId) ?? null;
}

export function startSelection(document: ReplayDocument): ReplaySelection {
  return { lineId: document.mainLineId, index: -1 };
}

export function endSelection(document: ReplayDocument): ReplaySelection {
  const main = findReplayLine(document, document.mainLineId);
  return { lineId: document.mainLineId, index: (main?.moves.length ?? 0) - 1 };
}

export function selectionFen(document: ReplayDocument, selection: ReplaySelection) {
  const line = findReplayLine(document, selection.lineId);
  if (!line) return null;
  if (selection.index === -1) return line.anchorFen;
  return line.moves[selection.index]?.fen ?? null;
}

export function previousSelection(
  document: ReplayDocument,
  selection: ReplaySelection,
): ReplaySelection | null {
  const line = findReplayLine(document, selection.lineId);
  if (!line) return null;

  if (selection.index > 0) {
    return { lineId: line.id, index: selection.index - 1 };
  }

  if (selection.index === 0) {
    if (line.parentLineId && line.parentMoveIndex !== null) {
      return { lineId: line.parentLineId, index: line.parentMoveIndex - 1 };
    }
    return { lineId: line.id, index: -1 };
  }

  if (selection.index === -1 && line.parentLineId && line.parentMoveIndex !== null) {
    return { lineId: line.parentLineId, index: line.parentMoveIndex - 1 };
  }

  return null;
}

export function nextSelection(
  document: ReplayDocument,
  selection: ReplaySelection,
): ReplaySelection | null {
  const line = findReplayLine(document, selection.lineId);
  if (!line) return null;
  const nextIndex = selection.index + 1;
  return nextIndex < line.moves.length ? { lineId: line.id, index: nextIndex } : null;
}

export function boardSquaresFromFen(fen: string): BoardSquare[] {
  const boardPart = fen.split(" ")[0];
  const ranks = boardPart.split("/");
  if (ranks.length !== 8) return [];

  const squares: BoardSquare[] = [];
  for (const [rankIndex, rankText] of ranks.entries()) {
    let fileIndex = 0;
    for (const token of rankText) {
      if (/^[1-8]$/.test(token)) {
        const empty = Number(token);
        for (let count = 0; count < empty; count += 1) {
          if (fileIndex >= 8) return [];
          const index = rankIndex * 8 + fileIndex;
          squares.push({ square: squareName(index), piece: null });
          fileIndex += 1;
        }
      } else if (piecePattern.test(token)) {
        if (fileIndex >= 8) return [];
        const index = rankIndex * 8 + fileIndex;
        squares.push({ square: squareName(index), piece: token });
        fileIndex += 1;
      } else {
        return [];
      }
    }
    if (fileIndex !== 8) return [];
  }

  return squares.length === 64 ? squares : [];
}
