import { describe, expect, it, vi } from "vitest";

import {
  BrowserStockfish,
  STOCKFISH_WORKER_URL,
  defaultEngineSettings,
  formatScore,
  parseEngineInfo,
  variationSan,
} from "../lib/games/browser-stockfish";

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

describe("local Stockfish evaluation", () => {
  it("normalizes centipawns and mate scores to White's perspective", () => {
    const white = parseEngineInfo("info depth 15 seldepth 20 multipv 1 score cp 117 nodes 500 pv e2e4 e7e5", startFen);
    expect(white).toMatchObject({ depth: 15, multiPv: 1, cp: 117, mate: null, score: "+1.17" });

    const black = parseEngineInfo("info depth 11 multipv 2 score cp 62 pv e7e5 g1f3", afterE4);
    expect(black).toMatchObject({ cp: -62, score: "-0.62", multiPv: 2 });

    const mate = parseEngineInfo("info depth 22 score mate -3 pv e7e5", afterE4);
    expect(mate).toMatchObject({ mate: 3, score: "#+3" });
    expect(formatScore(0, null)).toBe("+0.00");
  });

  it("ignores incomplete, bounded, or irrelevant engine output", () => {
    expect(parseEngineInfo("bestmove e2e4", startFen)).toBeNull();
    expect(parseEngineInfo("info depth 10 score cp 12", startFen)).toBeNull();
    expect(parseEngineInfo("info depth 10 score cp 12 lowerbound pv e2e4", startFen)).toBeNull();
    expect(parseEngineInfo("info depth 10 multipv 1 score cp 12 pv e2e4", startFen)?.pv).toEqual(["e2e4"]);
  });

  it("shows SAN in the principal variation from the evaluated position", () => {
    expect(variationSan(startFen, ["e2e4", "e7e5", "g1f3"])).toBe("e4 e5 Nf3");
    expect(variationSan(afterE4, ["e7e5", "g1f3"])).toBe("e5 Nf3");
    expect(variationSan(startFen, ["not-a-move"])).toBe("");
  });

  it("stops a running search before switching to the next game position", () => {
    const commands: string[] = [];
    const received: string[] = [];
    const onInfo = vi.fn();
    let terminated = false;

    const fakeWorker = {
      onmessage: null as ((event: MessageEvent<string>) => void) | null,
      onerror: null,
      postMessage: (message: string) => { commands.push(message); },
      terminate: () => { terminated = true; },
      emit(message: string) {
        this.onmessage?.({ data: message } as MessageEvent<string>);
      },
    };
    const engine = new BrowserStockfish(
      { ...defaultEngineSettings, depth: 12, multiPv: 2 },
      { onState: (state) => received.push(state), onInfo, onError: vi.fn() },
      (url) => {
        expect(url).toBe(STOCKFISH_WORKER_URL);
        return fakeWorker as unknown as Worker;
      },
    );

    engine.analyze(startFen);
    expect(commands).toEqual(["uci"]);
    fakeWorker.emit("uciok");
    expect(commands).toContain("setoption name MultiPV value 2");
    expect(commands).toContain("setoption name Hash value 16");
    fakeWorker.emit("readyok");
    expect(commands).toContain(`position fen ${startFen}`);
    expect(commands).toContain("go depth 12");

    fakeWorker.emit("info depth 8 multipv 1 score cp 21 pv e2e4");
    expect(onInfo).toHaveBeenCalledTimes(1);
    engine.analyze(afterE4);
    expect(commands.at(-1)).toBe("stop");
    fakeWorker.emit("info depth 9 multipv 1 score cp 29 pv e2e4");
    expect(onInfo).toHaveBeenCalledTimes(1);
    fakeWorker.emit("bestmove e2e4");
    expect(commands.slice(-2)).toEqual([`position fen ${afterE4}`, "go depth 12"]);

    fakeWorker.emit("info depth 9 multipv 1 score cp 35 pv e7e5");
    expect(onInfo).toHaveBeenCalledTimes(2);
    expect(onInfo.mock.lastCall?.[0]).toBe(afterE4);
    engine.dispose();
    expect(terminated).toBe(true);
    fakeWorker.emit("info depth 10 score cp 10 pv e7e5");
    expect(onInfo).toHaveBeenCalledTimes(2);
  });
});
