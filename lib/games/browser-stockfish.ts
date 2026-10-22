import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { makeSanAndPlay } from "chessops/san";
import { parseUci } from "chessops/util";

export const STOCKFISH_VERSION = "19";
export const STOCKFISH_WORKER_URL = "/stockfish/stockfish-19-lite-single.js";

export type EngineSettings = {
  depth: number;
  multiPv: number;
  hashMb: number;
};

export const defaultEngineSettings: EngineSettings = {
  depth: 16,
  multiPv: 3,
  hashMb: 16,
};

export type EngineLine = {
  depth: number;
  multiPv: number;
  score: string;
  cp: number | null;
  mate: number | null;
  pv: string[];
};

export function formatScore(cp: number | null, mate: number | null): string {
  if (mate !== null) return `#${mate > 0 ? "+" : ""}${mate}`;
  if (cp === null) return "—";
  const number = cp / 100;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

// Stockfish reports score from the side to move; the UI, like Lichess,
// presents evaluations from White's perspective.
export function parseEngineInfo(message: string, fen: string): EngineLine | null {
  if (!message.startsWith("info ") || !/\spv\s/.test(message) || /\b(?:lowerbound|upperbound)\b/.test(message)) {
    return null;
  }
  const depth = Number(/\bdepth (\d+)/.exec(message)?.[1]);
  const multiPv = Number(/\bmultipv (\d+)/.exec(message)?.[1] ?? "1");
  const score = /\bscore (cp|mate) (-?\d+)/.exec(message);
  const pv = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?:\s+[a-h][1-8][a-h][1-8][qrbn]?)*)/.exec(message)?.[1];
  if (!depth || !multiPv || !score || !pv) return null;

  const side = fen.split(" ")[1] === "b" ? -1 : 1;
  const value = Number(score[2]) * side;
  const cp = score[1] === "cp" ? value : null;
  const mate = score[1] === "mate" ? value : null;
  return {
    depth,
    multiPv,
    cp,
    mate,
    score: formatScore(cp, mate),
    pv: pv.split(/\s+/),
  };
}

export function variationSan(fen: string, variation: string[], limit = 8): string {
  try {
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    const moves: string[] = [];
    for (const uci of variation.slice(0, limit)) {
      const move = parseUci(uci);
      if (!move || !position.isLegal(move)) break;
      moves.push(makeSanAndPlay(position, move));
    }
    return moves.join(" ");
  } catch {
    return variation.slice(0, limit).join(" ");
  }
}

export type EngineCallbacks = {
  onState: (status: "loading" | "analyzing" | "ready") => void;
  onInfo: (fen: string, line: EngineLine) => void;
  onError: (message: string) => void;
};

// A single browser worker survives position changes. The UCI stop/bestmove
// handshake prevents old search output being confused with the new position.
export class BrowserStockfish {
  private worker: Worker;
  private status: "boot" | "wait" | "idle" | "search" | "stopping" = "boot";
  private desiredFen: string | null = null;
  private activeFen: string | null = null;
  private disposed = false;

  constructor(
    private readonly settings: EngineSettings,
    private readonly callbacks: EngineCallbacks,
    makeWorker: (url: string) => Worker = (url) => new Worker(url),
  ) {
    this.worker = makeWorker(STOCKFISH_WORKER_URL);
    this.worker.onmessage = (event: MessageEvent<string>) => {
      for (const line of String(event.data).split(/\r?\n/)) this.handle(line.trim());
    };
    this.worker.onerror = () => this.callbacks.onError("Unable to load the local Stockfish engine.");
    this.callbacks.onState("loading");
    this.worker.postMessage("uci");
  }

  analyze(fen: string) {
    if (this.disposed || !fen) return;
    if (fen === this.desiredFen) return;
    this.desiredFen = fen;
    if (this.status === "search") {
      this.status = "stopping";
      this.worker.postMessage("stop");
    } else if (this.status === "idle") {
      this.search();
    }
  }

  private search() {
    if (!this.desiredFen || this.disposed) return;
    this.activeFen = this.desiredFen;
    this.status = "search";
    this.callbacks.onState("analyzing");
    this.worker.postMessage(`position fen ${this.activeFen}`);
    this.worker.postMessage(`go depth ${this.settings.depth}`);
  }

  private handle(line: string) {
    if (this.disposed) return;
    if (line === "uciok" && this.status === "boot") {
      this.status = "wait";
      this.worker.postMessage(`setoption name Hash value ${this.settings.hashMb}`);
      this.worker.postMessage(`setoption name MultiPV value ${this.settings.multiPv}`);
      this.worker.postMessage("isready");
    } else if (line === "readyok" && this.status === "wait") {
      this.status = "idle";
      this.callbacks.onState("ready");
      this.search();
    } else if (line.startsWith("bestmove ") && (this.status === "search" || this.status === "stopping")) {
      const replaced = this.status === "stopping";
      this.status = "idle";
      if (replaced) this.search();
      else this.callbacks.onState("ready");
    } else if (this.status === "search" && this.activeFen) {
      const result = parseEngineInfo(line, this.activeFen);
      if (result && result.multiPv <= this.settings.multiPv) this.callbacks.onInfo(this.activeFen, result);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
  }
}
