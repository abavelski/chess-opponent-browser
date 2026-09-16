export function buildFixtureKey({ playedOn, whiteFideId, blackFideId, result, round }) {
  const parts = [playedOn ?? "unknown", whiteFideId, blackFideId, result, round ?? ""];
  return `task003:${parts.map((part) => String(part).trim().toLowerCase()).join("|")}`;
}

function validateMove(move, path) {
  if (!move || typeof move !== "object" || Array.isArray(move)) {
    throw new Error(`${path} must be an object.`);
  }

  if (typeof move.san !== "string" || move.san.trim() === "") {
    throw new Error(`${path}.san must be a non-empty string.`);
  }

  if (typeof move.uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci)) {
    throw new Error(`${path}.uci must be a valid UCI move.`);
  }

  if (move.comment !== undefined && typeof move.comment !== "string") {
    throw new Error(`${path}.comment must be a string when provided.`);
  }

  if (move.variations !== undefined) {
    if (!Array.isArray(move.variations)) {
      throw new Error(`${path}.variations must be an array.`);
    }

    for (const [variationIndex, variation] of move.variations.entries()) {
      if (!variation || typeof variation !== "object" || !Array.isArray(variation.moves)) {
        throw new Error(`${path}.variations[${variationIndex}] must contain a moves array.`);
      }

      for (const [moveIndex, variationMove] of variation.moves.entries()) {
        validateMove(variationMove, `${path}.variations[${variationIndex}].moves[${moveIndex}]`);
      }
    }
  }
}

export function validateStructuredMoves(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Structured moves must be an object.");
  }

  if (value.version !== 1) {
    throw new Error("Structured moves version must be 1.");
  }

  if (!Array.isArray(value.mainline) || value.mainline.length === 0) {
    throw new Error("Structured moves must contain a non-empty mainline.");
  }

  for (const [index, move] of value.mainline.entries()) {
    validateMove(move, `mainline[${index}]`);
  }

  return true;
}

export const fixtureSources = [
  { sourceKey: "fixture-manual", label: "Fixture · Manual sample" },
  { sourceKey: "fixture-archive", label: "Fixture · Archive sample" },
];

export const fixturePlayers = [
  { key: "jan", name: "Jan Kowalski", fideId: "99000001" },
  { key: "anna", name: "Anna Nowak", fideId: "99000002" },
  { key: "piotr", name: "Piotr Zielinski", fideId: "99000003" },
  { key: "marta", name: "Marta Lewandowska", fideId: "99000004" },
  { key: "tomas", name: "Tomas Eriksen", fideId: "99000005" },
  { key: "empty", name: "No Games Player", fideId: "99000006" },
];

export const fixtureTournament = {
  metadataKey: "fixture.task003.tournament_id",
  name: "Task 003 Fixture Open",
  participants: [
    { playerKey: "jan", rating: 2140, federation: "POL" },
    { playerKey: "empty", rating: 1980, federation: "DEN" },
  ],
};

const moves = {
  caroKann: {
    version: 1,
    mainline: [
      { san: "e4", uci: "e2e4" },
      { san: "c6", uci: "c7c6" },
      {
        san: "d4",
        uci: "d2d4",
        comment: "Fixture main line with a stored comment.",
        variations: [
          {
            moves: [
              { san: "Nc3", uci: "b1c3" },
              { san: "d5", uci: "d7d5" },
            ],
          },
        ],
      },
      { san: "d5", uci: "d7d5" },
      { san: "Nc3", uci: "b1c3" },
    ],
  },
  sicilian: {
    version: 1,
    mainline: [
      { san: "e4", uci: "e2e4" },
      { san: "c5", uci: "c7c5" },
      { san: "Nf3", uci: "g1f3" },
      { san: "d6", uci: "d7d6" },
      { san: "d4", uci: "d2d4" },
    ],
  },
  queensGambit: {
    version: 1,
    mainline: [
      { san: "d4", uci: "d2d4" },
      { san: "d5", uci: "d7d5" },
      { san: "c4", uci: "c2c4" },
      { san: "e6", uci: "e7e6" },
      { san: "Nc3", uci: "b1c3" },
    ],
  },
  english: {
    version: 1,
    mainline: [
      { san: "c4", uci: "c2c4" },
      { san: "e5", uci: "e7e5" },
      { san: "Nc3", uci: "b1c3" },
      { san: "Nf6", uci: "g8f6" },
    ],
  },
  unknownDate: {
    version: 1,
    mainline: [
      { san: "Nf3", uci: "g1f3" },
      { san: "d5", uci: "d7d5" },
      { san: "g3", uci: "g2g3" },
      { san: "c5", uci: "c7c5" },
    ],
  },
};

export const fixtureGames = [
  {
    sourceKey: "fixture-manual",
    whitePlayerKey: "jan",
    blackPlayerKey: "anna",
    whiteName: "Jan Kowalski",
    blackName: "Anna Nowak",
    whiteRating: 2140,
    blackRating: 2210,
    playedOn: "2026-08-21",
    result: "1-0",
    event: "Copenhagen Training Open",
    site: "Copenhagen DEN",
    round: "4",
    eco: "B12",
    opening: "Caro-Kann Defence",
    originalPgn: `[Event "Copenhagen Training Open"]\n[Site "Copenhagen DEN"]\n[Date "2026.08.21"]\n[Round "4"]\n[White "Jan Kowalski"]\n[Black "Anna Nowak"]\n[Result "1-0"]\n[ECO "B12"]\n\n1. e4 c6 2. d4 d5 3. Nc3 1-0`,
    structuredMoves: moves.caroKann,
  },
  {
    sourceKey: "fixture-archive",
    whitePlayerKey: "piotr",
    blackPlayerKey: "jan",
    whiteName: "Piotr Zielinski",
    blackName: "Jan Kowalski",
    whiteRating: 2285,
    blackRating: 2140,
    playedOn: "2026-06-03",
    result: "1-0",
    event: "Baltic Archive Cup",
    site: "Gdansk POL",
    round: "2",
    eco: "B90",
    opening: "Sicilian Defence, Najdorf",
    originalPgn: `[Event "Baltic Archive Cup"]\n[Site "Gdansk POL"]\n[Date "2026.06.03"]\n[Round "2"]\n[White "Piotr Zielinski"]\n[Black "Jan Kowalski"]\n[Result "1-0"]\n[ECO "B90"]\n\n1. e4 c5 2. Nf3 d6 3. d4 1-0`,
    structuredMoves: moves.sicilian,
  },
  {
    sourceKey: "fixture-manual",
    whitePlayerKey: "marta",
    blackPlayerKey: "jan",
    whiteName: "Marta Lewandowska",
    blackName: "Jan Kowalski",
    whiteRating: 2050,
    blackRating: 2140,
    playedOn: "2025-11-14",
    result: "0-1",
    event: "Autumn Preparation Match",
    site: "Online",
    round: "1",
    eco: "D30",
    opening: "Queen's Gambit Declined",
    originalPgn: `[Event "Autumn Preparation Match"]\n[Site "Online"]\n[Date "2025.11.14"]\n[Round "1"]\n[White "Marta Lewandowska"]\n[Black "Jan Kowalski"]\n[Result "0-1"]\n[ECO "D30"]\n\n1. d4 d5 2. c4 e6 3. Nc3 0-1`,
    structuredMoves: moves.queensGambit,
  },
  {
    sourceKey: "fixture-archive",
    whitePlayerKey: "jan",
    blackPlayerKey: "tomas",
    whiteName: "Jan Kowalski",
    blackName: "Tomas Eriksen",
    whiteRating: 2125,
    blackRating: 2320,
    playedOn: "2025-02-10",
    result: "1/2-1/2",
    event: "Nordic Archive Invitational",
    site: "Malmo SWE",
    round: "6",
    eco: "A28",
    opening: "English Opening, Four Knights",
    originalPgn: `[Event "Nordic Archive Invitational"]\n[Site "Malmo SWE"]\n[Date "2025.02.10"]\n[Round "6"]\n[White "Jan Kowalski"]\n[Black "Tomas Eriksen"]\n[Result "1/2-1/2"]\n[ECO "A28"]\n\n1. c4 e5 2. Nc3 Nf6 1/2-1/2`,
    structuredMoves: moves.english,
  },
  {
    sourceKey: "fixture-manual",
    whitePlayerKey: "anna",
    blackPlayerKey: "jan",
    whiteName: "Anna Nowak",
    blackName: "Jan Kowalski",
    whiteRating: null,
    blackRating: 2100,
    playedOn: null,
    result: "1/2-1/2",
    event: null,
    site: null,
    round: null,
    eco: null,
    opening: null,
    originalPgn: `[White "Anna Nowak"]\n[Black "Jan Kowalski"]\n[Result "1/2-1/2"]\n\n1. Nf3 d5 2. g3 c5 1/2-1/2`,
    structuredMoves: moves.unknownDate,
  },
].map((game) => {
  const white = fixturePlayers.find((player) => player.key === game.whitePlayerKey);
  const black = fixturePlayers.find((player) => player.key === game.blackPlayerKey);

  if (!white || !black) {
    throw new Error("Fixture game references an unknown player key.");
  }

  return {
    ...game,
    sourceGameKey: buildFixtureKey({
      playedOn: game.playedOn,
      whiteFideId: white.fideId,
      blackFideId: black.fideId,
      result: game.result,
      round: game.round,
    }),
  };
});

export function validateFixtureSet() {
  const sourceKeys = new Set(fixtureSources.map((source) => source.sourceKey));
  const playerKeys = new Set(fixturePlayers.map((player) => player.key));
  const gameKeys = new Set();

  for (const participant of fixtureTournament.participants) {
    if (!playerKeys.has(participant.playerKey)) {
      throw new Error(`Unknown fixture participant: ${participant.playerKey}`);
    }
  }

  for (const game of fixtureGames) {
    if (!sourceKeys.has(game.sourceKey)) {
      throw new Error(`Unknown fixture source: ${game.sourceKey}`);
    }
    if (!playerKeys.has(game.whitePlayerKey) || !playerKeys.has(game.blackPlayerKey)) {
      throw new Error("Fixture game references an unknown player.");
    }

    validateStructuredMoves(game.structuredMoves);

    const scopedKey = `${game.sourceKey}:${game.sourceGameKey}`;
    if (gameKeys.has(scopedKey)) {
      throw new Error(`Duplicate fixture game key: ${scopedKey}`);
    }
    gameKeys.add(scopedKey);
  }

  return true;
}
