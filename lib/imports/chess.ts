export type ImportChessPosition = {
  board: Array<string | null>;
  activeColor: "w" | "b";
  castling: string;
  enPassant: string | null;
  halfmove: number;
  fullmove: number;
};

export type ResolvedSanMove = {
  uci: string;
  position: ImportChessPosition;
};

const files = "abcdefgh";

function squareIndex(square: string) {
  if (!/^[a-h][1-8]$/.test(square)) return -1;
  const file = files.indexOf(square[0]);
  const rank = Number(square[1]);
  return (8 - rank) * 8 + file;
}

function squareName(index: number) {
  const file = files[index % 8];
  const rank = 8 - Math.floor(index / 8);
  return `${file}${rank}`;
}

function fileOf(index: number) {
  return index % 8;
}

function rankOf(index: number) {
  return 8 - Math.floor(index / 8);
}

function pieceColor(piece: string) {
  return piece === piece.toUpperCase() ? "w" : "b";
}

function clonePosition(position: ImportChessPosition): ImportChessPosition {
  return { ...position, board: [...position.board] };
}

function removeCastlingRight(castling: string, right: string) {
  return castling.replace(right, "");
}

function isPathClear(position: ImportChessPosition, from: number, to: number) {
  const fromFile = fileOf(from);
  const fromRank = rankOf(from);
  const toFile = fileOf(to);
  const toRank = rankOf(to);
  const fileStep = Math.sign(toFile - fromFile);
  const rankStep = Math.sign(toRank - fromRank);
  let file = fromFile + fileStep;
  let rank = fromRank + rankStep;

  while (file !== toFile || rank !== toRank) {
    const index = squareIndex(`${files[file]}${rank}`);
    if (index < 0 || position.board[index]) return false;
    file += fileStep;
    rank += rankStep;
  }

  return true;
}

function attacksSquare(
  position: ImportChessPosition,
  from: number,
  target: number,
  piece: string,
) {
  const fromFile = fileOf(from);
  const fromRank = rankOf(from);
  const targetFile = fileOf(target);
  const targetRank = rankOf(target);
  const fileDelta = targetFile - fromFile;
  const rankDelta = targetRank - fromRank;
  const lower = piece.toLowerCase();

  if (lower === "p") {
    const direction = pieceColor(piece) === "w" ? 1 : -1;
    return rankDelta === direction && Math.abs(fileDelta) === 1;
  }

  if (lower === "n") {
    return (
      (Math.abs(fileDelta) === 1 && Math.abs(rankDelta) === 2) ||
      (Math.abs(fileDelta) === 2 && Math.abs(rankDelta) === 1)
    );
  }

  if (lower === "k") {
    return Math.max(Math.abs(fileDelta), Math.abs(rankDelta)) === 1;
  }

  if (lower === "b") {
    return Math.abs(fileDelta) === Math.abs(rankDelta) && isPathClear(position, from, target);
  }

  if (lower === "r") {
    return (fileDelta === 0 || rankDelta === 0) && isPathClear(position, from, target);
  }

  if (lower === "q") {
    const diagonal = Math.abs(fileDelta) === Math.abs(rankDelta);
    const straight = fileDelta === 0 || rankDelta === 0;
    return (diagonal || straight) && isPathClear(position, from, target);
  }

  return false;
}

function isSquareAttacked(
  position: ImportChessPosition,
  target: number,
  byColor: "w" | "b",
) {
  for (let from = 0; from < 64; from += 1) {
    const piece = position.board[from];
    if (!piece || pieceColor(piece) !== byColor) continue;
    if (attacksSquare(position, from, target, piece)) return true;
  }
  return false;
}

function isKingSafe(position: ImportChessPosition, color: "w" | "b") {
  const king = color === "w" ? "K" : "k";
  const kingIndex = position.board.findIndex((piece) => piece === king);
  if (kingIndex < 0) return false;
  return !isSquareAttacked(position, kingIndex, color === "w" ? "b" : "w");
}

function applyMoveUnchecked(
  position: ImportChessPosition,
  from: number,
  to: number,
  promotion?: string,
) {
  const next = clonePosition(position);
  const movingPiece = next.board[from];
  const targetPiece = next.board[to];
  if (!movingPiece) throw new Error("Move source is empty.");

  const color = pieceColor(movingPiece);
  const fromSquare = squareName(from);
  const toSquare = squareName(to);
  const fromFile = fileOf(from);
  const toFile = fileOf(to);
  const fromRank = rankOf(from);
  const toRank = rankOf(to);
  const isPawn = movingPiece.toLowerCase() === "p";
  const isKing = movingPiece.toLowerCase() === "k";
  let capture = Boolean(targetPiece);

  if (isPawn && fromFile !== toFile && !targetPiece) {
    if (position.enPassant !== toSquare) {
      throw new Error("Invalid en passant capture.");
    }
    const capturedPawnIndex = squareIndex(`${toSquare[0]}${fromRank}`);
    const capturedPawn = next.board[capturedPawnIndex];
    if (
      !capturedPawn ||
      capturedPawn.toLowerCase() !== "p" ||
      pieceColor(capturedPawn) === color
    ) {
      throw new Error("Invalid en passant capture.");
    }
    next.board[capturedPawnIndex] = null;
    capture = true;
  }

  next.board[from] = null;

  if (isKing && Math.abs(fromFile - toFile) === 2) {
    const kingSide = toFile > fromFile;
    const rookFrom = squareIndex(`${kingSide ? "h" : "a"}${fromRank}`);
    const rookTo = squareIndex(`${kingSide ? "f" : "d"}${fromRank}`);
    const rook = next.board[rookFrom];
    const expectedRook = color === "w" ? "R" : "r";
    if (rook !== expectedRook) throw new Error("Invalid castling move.");
    next.board[rookFrom] = null;
    next.board[rookTo] = rook;
  }

  let placedPiece = movingPiece;
  if (promotion) {
    if (!isPawn || (toRank !== 1 && toRank !== 8)) {
      throw new Error("Invalid promotion move.");
    }
    placedPiece = color === "w" ? promotion.toUpperCase() : promotion.toLowerCase();
  } else if (isPawn && (toRank === 1 || toRank === 8)) {
    throw new Error("Promotion piece is missing.");
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
    next.enPassant = `${fromSquare[0]}${(fromRank + toRank) / 2}`;
  }

  next.halfmove = isPawn || capture ? 0 : next.halfmove + 1;
  if (color === "b") next.fullmove += 1;
  next.activeColor = color === "w" ? "b" : "w";
  return next;
}

function pawnCanMove(
  position: ImportChessPosition,
  from: number,
  to: number,
  capture: boolean,
) {
  const piece = position.board[from];
  if (!piece || piece.toLowerCase() !== "p") return false;
  const color = pieceColor(piece);
  const direction = color === "w" ? 1 : -1;
  const startRank = color === "w" ? 2 : 7;
  const fromFile = fileOf(from);
  const toFile = fileOf(to);
  const fromRank = rankOf(from);
  const toRank = rankOf(to);
  const target = position.board[to];

  if (capture) {
    if (Math.abs(toFile - fromFile) !== 1 || toRank - fromRank !== direction) return false;
    if (target) return pieceColor(target) !== color;
    return position.enPassant === squareName(to);
  }

  if (toFile !== fromFile || target) return false;
  if (toRank - fromRank === direction) return true;
  if (fromRank !== startRank || toRank - fromRank !== direction * 2) return false;
  const middle = squareIndex(`${files[fromFile]}${fromRank + direction}`);
  return !position.board[middle];
}

function pieceCanMove(
  position: ImportChessPosition,
  from: number,
  to: number,
  capture: boolean,
) {
  const piece = position.board[from];
  if (!piece) return false;
  const target = position.board[to];
  const color = pieceColor(piece);
  if (target && pieceColor(target) === color) return false;
  if (capture !== Boolean(target)) return false;
  return attacksSquare(position, from, to, piece);
}

function resolveCastle(position: ImportChessPosition, queenSide: boolean): ResolvedSanMove {
  const color = position.activeColor;
  const rank = color === "w" ? 1 : 8;
  const from = squareIndex(`e${rank}`);
  const to = squareIndex(`${queenSide ? "c" : "g"}${rank}`);
  const right = color === "w" ? (queenSide ? "Q" : "K") : queenSide ? "q" : "k";
  if (!position.castling.includes(right)) throw new Error("Castling right is not available.");
  const requiredEmpty = queenSide ? [`b${rank}`, `c${rank}`, `d${rank}`] : [`f${rank}`, `g${rank}`];
  if (requiredEmpty.some((square) => position.board[squareIndex(square)])) {
    throw new Error("Castling path is blocked.");
  }
  const opponent = color === "w" ? "b" : "w";
  const transit = queenSide ? [`e${rank}`, `d${rank}`, `c${rank}`] : [`e${rank}`, `f${rank}`, `g${rank}`];
  if (transit.some((square) => isSquareAttacked(position, squareIndex(square), opponent))) {
    throw new Error("Castling through check is not legal.");
  }
  const next = applyMoveUnchecked(position, from, to);
  if (!isKingSafe(next, color)) throw new Error("Castling leaves king in check.");
  return { uci: `${squareName(from)}${squareName(to)}`, position: next };
}

function normalizeSan(rawSan: string) {
  return rawSan
    .trim()
    .replace(/^\.\.\./, "")
    .replace(/\s*e\.p\.?$/i, "")
    .replace(/[!?]+$/g, "")
    .replace(/[+#]+$/g, "")
    .trim();
}

export function createInitialPosition(): ImportChessPosition {
  const rows = [
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
    board: rows.flatMap((row) => [...row].map((piece) => (piece === "." ? null : piece))),
    activeColor: "w",
    castling: "KQkq",
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

export function cloneImportPosition(position: ImportChessPosition) {
  return clonePosition(position);
}

export function resolveSanMove(
  position: ImportChessPosition,
  rawSan: string,
): ResolvedSanMove {
  const san = normalizeSan(rawSan).replace(/0/g, "O");
  if (san === "O-O") return resolveCastle(position, false);
  if (san === "O-O-O") return resolveCastle(position, true);

  const match = san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/);
  if (!match) throw new Error(`Unsupported move notation: ${rawSan}`);

  const [, pieceLetter, disFile, disRank, captureMarker, targetSquare, promotion] = match;
  const desiredPiece = pieceLetter ?? "P";
  const capture = Boolean(captureMarker);
  const target = squareIndex(targetSquare);
  const candidates: Array<{ from: number; position: ImportChessPosition }> = [];

  for (let from = 0; from < 64; from += 1) {
    const piece = position.board[from];
    if (!piece || pieceColor(piece) !== position.activeColor) continue;
    if (piece.toUpperCase() !== desiredPiece) continue;
    if (disFile && files[fileOf(from)] !== disFile) continue;
    if (disRank && String(rankOf(from)) !== disRank) continue;

    const canMove =
      desiredPiece === "P"
        ? pawnCanMove(position, from, target, capture)
        : pieceCanMove(position, from, target, capture);
    if (!canMove) continue;

    try {
      const next = applyMoveUnchecked(position, from, target, promotion);
      if (isKingSafe(next, position.activeColor)) candidates.push({ from, position: next });
    } catch {
      // A candidate can fail special-move validation; keep checking other pieces.
    }
  }

  if (candidates.length !== 1) {
    const reason = candidates.length === 0 ? "no legal source square" : "ambiguous source square";
    throw new Error(`Could not resolve ${rawSan}: ${reason}.`);
  }

  const candidate = candidates[0];
  return {
    uci: `${squareName(candidate.from)}${targetSquare}${promotion?.toLowerCase() ?? ""}`,
    position: candidate.position,
  };
}
