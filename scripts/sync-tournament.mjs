#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { packFilename, uploadPack } from "./add-opponents.mjs";
import { extractOpponentPacks } from "./extract-opponent.mjs";
import {
  extractVisibleDsuParticipants,
  fetchDsuProfile,
  openDsuParticipantTable,
} from "../lib/local/sources/dsu.mjs";
import { fetchFideProfile } from "../lib/local/sources/fide.mjs";
import {
  fetchLichessBroadcastPgn,
  fetchLichessBroadcastTour,
  fetchLichessFideBroadcasts,
} from "../lib/local/sources/lichess.mjs";

const DEFAULT_DANBASE = "C:/dev/danbase.pgn";
const DEFAULT_APP_URL = "https://chess-opponent-browser.vercel.app";
const DEFAULT_TOURNAMENT_URL = "https://turnering.skak.dk/TournamentActive/Details?tourId=30508";
const DEFAULT_RATING_TTL_DAYS = 30;
const COMMANDS = new Set(["all", "participants", "dsu", "fide", "ratings", "app", "games", "lichess"]);

export function toRating(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  const rating = digits ? Number(digits) : null;
  return rating && rating >= 1 && rating <= 4000 ? rating : null;
}

export function normalizeParticipantName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\d+\.\s*/, "");
}

export function identityKeys(player) {
  const clean = (value) => String(value ?? "").normalize("NFKC").trim().toLowerCase();
  return [
    player.dsuId ? `dsu:${clean(player.dsuId)}` : null,
    player.fideId ? `fide:${clean(player.fideId)}` : null,
    player.dsuProfileUrl ? `dsu-url:${clean(player.dsuProfileUrl)}` : null,
    player.name ? `name:${clean(player.name).replace(/\s+/g, " ")}` : null,
  ].filter(Boolean);
}

export function danbaseNameVariants(name) {
  const canonical = normalizeParticipantName(name);
  const withoutTitle = canonical.replace(/^(?:GM|IM|FM|CM|WGM|WIM|WFM|WCM)\s+/i, "");
  const variants = new Set([canonical, withoutTitle]);
  const substitutions = {
    æ: ["ae", "a"],
    ø: ["oe", "o"],
    å: ["aa", "a"],
  };
  const expand = (value, start = 0) => {
    const characters = [...value];
    const position = characters.findIndex(
      (character, index) => index >= start && substitutions[character],
    );
    if (position === -1) {
      variants.add(value);
      return;
    }
    for (const replacement of substitutions[characters[position]]) {
      const next = [...characters];
      next.splice(position, 1, replacement);
      expand(next.join(""), position + replacement.length);
    }
  };
  expand(canonical);
  expand(withoutTitle);

  for (const value of [...variants]) {
    const parts = value.split(" ");
    if (parts.length > 1) {
      const surname = parts.at(-1);
      const givenNames = parts.slice(0, -1).join(" ");
      variants.add(`${surname}, ${givenNames}`);
      variants.add(`${surname},${givenNames}`);
    }
  }
  return [...variants].filter(Boolean);
}

export function mergeParticipants(existing, fresh) {
  const index = new Map();
  for (const player of existing) {
    for (const key of identityKeys(player)) if (!index.has(key)) index.set(key, player);
  }

  return fresh.map((player) => {
    const previous = identityKeys(player).map((key) => index.get(key)).find(Boolean);
    if (!previous) return player;
    return {
      ...previous,
      ...player,
      actualDsuRating: previous.actualDsuRating ?? player.actualDsuRating,
      actualFideRating: previous.actualFideRating ?? player.actualFideRating,
      dsuRatingUpdatedAt: previous.dsuRatingUpdatedAt ?? null,
      fideRatingUpdatedAt: previous.fideRatingUpdatedAt ?? null,
      fideId: player.fideId ?? previous.fideId,
      dsuProfileUrl: player.dsuProfileUrl ?? previous.dsuProfileUrl,
      fideProfileUrl: player.fideProfileUrl ?? previous.fideProfileUrl,
    };
  });
}

export function parseArguments(argv) {
  const options = {
    command: "all",
    nickname: "",
    snapshotPath: "",
    tournamentUrl: "",
    danbasePath: DEFAULT_DANBASE,
    appUrl: process.env.OPPONENT_BROWSER_URL || DEFAULT_APP_URL,
    packsDir: "",
    throttleMs: 2500,
    includeRatings: false,
    ratingMode: "none",
    ratingTtlDays: DEFAULT_RATING_TTL_DAYS,
    includeLichess: false,
    lichessThrottleMs: 750,
    lichessMaxTournaments: 3,
    dryRun: false,
    force: false,
    help: false,
  };

  let index = 0;
  if (argv[0] && COMMANDS.has(argv[0].toLowerCase())) {
    options.command = argv[0].toLowerCase();
    index = 1;
  }

  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--ratings") {
      options.includeRatings = true;
      options.ratingMode = "all";
    }
    else if (argument === "--ratings=stale") {
      options.includeRatings = true;
      options.ratingMode = "stale";
    }
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--lichess") options.includeLichess = true;
    else if (["--file", "-f", "--url", "-u", "--danbase", "--input", "-i", "--app-url", "--packs-dir", "--throttle", "--rating-ttl-days", "--lichess-throttle", "--lichess-max-tournaments"].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      if (argument === "--file" || argument === "-f") options.snapshotPath = value;
      else if (argument === "--url" || argument === "-u") options.tournamentUrl = value;
      else if (["--danbase", "--input", "-i"].includes(argument)) options.danbasePath = value;
      else if (argument === "--app-url") options.appUrl = value;
      else if (argument === "--packs-dir") options.packsDir = value;
      else if (argument === "--throttle") options.throttleMs = Number(value);
      else if (argument === "--lichess-throttle") options.lichessThrottleMs = Number(value);
      else if (argument === "--lichess-max-tournaments") options.lichessMaxTournaments = Number(value);
      else options.ratingTtlDays = Number(value);
    } else if (!argument.startsWith("-") && !options.nickname) {
      options.nickname = argument.trim().toLowerCase();
    } else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isFinite(options.throttleMs) || options.throttleMs < 0) {
    throw new Error("--throttle must be a non-negative number.");
  }
  if (!Number.isFinite(options.ratingTtlDays) || options.ratingTtlDays < 1) {
    throw new Error("--rating-ttl-days must be a positive number.");
  }
  if (!Number.isFinite(options.lichessThrottleMs) || options.lichessThrottleMs < 0) {
    throw new Error("--lichess-throttle must be a non-negative number.");
  }
  if (!Number.isInteger(options.lichessMaxTournaments) || options.lichessMaxTournaments < 1 || options.lichessMaxTournaments > 10) {
    throw new Error("--lichess-max-tournaments must be a whole number from 1 to 10.");
  }
  return options;
}

export function filterParticipantsByGroup(players, participantGroup) {
  if (!participantGroup) return players;
  const normalize = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const expected = normalize(participantGroup);
  return players.filter((player) => normalize(player.group) === expected);
}

export async function fetchTournamentConfig(options) {
  const endpoint = new URL("/api/admin/tournaments/config", options.appUrl);
  if (options.nickname) endpoint.searchParams.set("nickname", options.nickname);
  const response = await fetch(endpoint);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || `Tournament configuration failed with HTTP ${response.status}.`);
  }
  return payload.tournament;
}

export function workspacePaths(nickname) {
  const normalized = String(nickname ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error("Tournament nickname is not safe for a local workspace path.");
  }
  return {
    snapshotPath: join("data", "tournaments", normalized, "participants.json"),
    syncStatePath: join("data", "tournaments", normalized, "sync-state.json"),
    packsDir: join("packs", normalized),
  };
}

export async function configureWorkspace(options) {
  const tournament = await fetchTournamentConfig(options);
  const paths = workspacePaths(tournament.nickname);
  return {
    ...options,
    nickname: tournament.nickname,
    snapshotPath: options.snapshotPath || paths.snapshotPath,
    syncStatePath: paths.syncStatePath,
    packsDir: options.packsDir || paths.packsDir,
    tournament,
  };
}

export function assertSnapshotTarget(snapshot, nickname) {
  if (!snapshot.tournamentNickname) {
    throw new Error("Snapshot has no tournament nickname. Refresh participants before syncing it.");
  }
  if (snapshot.tournamentNickname.toLowerCase() !== nickname.toLowerCase()) {
    throw new Error(
      `Snapshot belongs to '${snapshot.tournamentNickname}', not '${nickname}'. Refresh participants or select the matching tournament.`,
    );
  }
}

export async function readSnapshot(filePath) {
  const parsed = JSON.parse(await readFile(resolve(filePath), "utf8"));
  if (Array.isArray(parsed)) return { version: 2, sourceUrl: null, extractedAt: null, players: parsed };
  if (!parsed || !Array.isArray(parsed.players)) throw new Error("Snapshot must contain a players array.");
  return {
    ...parsed,
    version: 2,
    players: parsed.players.map((player) => ({
      ...player,
      dsuRatingUpdatedAt: player.dsuRatingUpdatedAt ?? null,
      fideRatingUpdatedAt: player.fideRatingUpdatedAt ?? null,
    })),
  };
}

export function isProviderRatingStale(updatedAt, ttlDays, now = new Date()) {
  if (!updatedAt) return true;
  const timestamp = new Date(updatedAt).valueOf();
  if (!Number.isFinite(timestamp)) return true;
  return now.valueOf() - timestamp >= ttlDays * 24 * 60 * 60 * 1000;
}

export function snapshotHash(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function syncRunKind(command) {
  if (["dsu", "fide", "ratings"].includes(command)) return "ratings";
  if (["games", "lichess"].includes(command)) return "games";
  if (["participants", "app"].includes(command)) return "participants";
  return "full";
}

async function startSyncRun(options) {
  const response = await fetch(new URL("/api/admin/tournaments/sync-runs", options.appUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tournamentNickname: options.nickname, kind: syncRunKind(options.command) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || `Could not start sync run (HTTP ${response.status}).`);
  return payload.run;
}

async function finishSyncRun(options, run, status, summary, errorText = null) {
  const snapshot = await readSnapshot(options.snapshotPath).catch(() => null);
  const response = await fetch(new URL("/api/admin/tournaments/sync-runs", options.appUrl), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: run.id,
      tournamentNickname: options.nickname,
      status,
      snapshotHash: snapshot ? snapshotHash(snapshot) : null,
      summary,
      errorText,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || `Could not finish sync run (HTTP ${response.status}).`);
}

async function saveSnapshot(filePath, snapshot) {
  const target = resolve(filePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return target;
}

async function updateSyncState(options, stage, details) {
  if (!options.syncStatePath) return;
  const previous = await readFile(resolve(options.syncStatePath), "utf8")
    .then((contents) => JSON.parse(contents))
    .catch(() => ({}));
  const next = {
    ...previous,
    version: 1,
    tournamentNickname: options.nickname,
    updatedAt: new Date().toISOString(),
    [stage]: details,
  };
  await saveSnapshot(options.syncStatePath, next);
}

async function launchBrowser() {
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
}

async function extractAllParticipants(page) {
  const tableId = await page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim().toLowerCase();
    return Array.from(document.querySelectorAll("#tour-players table")).find((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => clean(th.textContent));
      return headers.includes("navn") && headers.includes("rating (std.)");
    })?.id || "";
  });
  if (!tableId) throw new Error("Could not find the participant table.");

  const players = new Map();
  while (true) {
    for (const raw of await extractVisibleDsuParticipants(page)) {
      const player = {
        ...raw,
        name: normalizeParticipantName(raw.name),
        tournamentDsuRating: toRating(raw.tournamentDsuRating),
        tournamentFideRating: toRating(raw.tournamentFideRating),
        actualDsuRating: null,
        actualFideRating: null,
        dsuRatingUpdatedAt: null,
        fideRatingUpdatedAt: null,
      };
      players.set(identityKeys(player)[0] ?? `name:${player.name.toLowerCase()}`, player);
    }
    const info = await page.$eval(`#${tableId}_info`, (node) => node.textContent.replace(/\s+/g, " ").trim());
    const advanced = await page.evaluate((id) => {
      const next = document.querySelector(`#${id}_next`);
      if (!next || next.classList.contains("disabled")) return false;
      next.click();
      return true;
    }, tableId);
    if (!advanced) break;
    await page.waitForFunction((id, previous) => document.querySelector(`#${id}_info`)?.textContent.replace(/\s+/g, " ").trim() !== previous, {}, tableId, info);
  }
  return [...players.values()];
}

export async function refreshParticipants(options) {
  const previous = await readSnapshot(options.snapshotPath).catch(() => ({ players: [], sourceUrl: null }));
  const tournament = options.tournament ?? await fetchTournamentConfig(options);
  if (!tournament.sourceUrl && !options.tournamentUrl) {
    throw new Error(`Tournament '${tournament.nickname}' has no source URL.`);
  }
  const sourceUrl = options.tournamentUrl || tournament.sourceUrl || previous.sourceUrl || DEFAULT_TOURNAMENT_URL;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await openDsuParticipantTable(page, sourceUrl);
    const extracted = await extractAllParticipants(page);
    const selected = filterParticipantsByGroup(extracted, tournament.participantGroup);
    if (tournament.participantGroup && selected.length === 0) {
      const available = [...new Set(extracted.map((player) => player.group).filter(Boolean))].join(", ");
      throw new Error(`No participants matched group '${tournament.participantGroup}'. Available groups: ${available || "none"}.`);
    }
    const players = mergeParticipants(previous.players, selected);
    const snapshot = {
      version: 2,
      tournamentNickname: tournament.nickname,
      participantGroup: tournament.participantGroup,
      sourceUrl,
      extractedAt: new Date().toISOString(),
      players,
    };
    const target = await saveSnapshot(options.snapshotPath, snapshot);
    await updateSyncState(options, "participants", {
      completedAt: new Date().toISOString(),
      count: players.length,
      sourceUrl,
    });
    process.stdout.write(`Saved ${players.length} participants to ${target}.\n`);
    return snapshot;
  } finally {
    await browser.close();
  }
}

export async function refreshRatings(options, types) {
  const snapshot = await readSnapshot(options.snapshotPath);
  const mode = options.ratingMode === "stale" ? "stale" : "all";
  const summary = {
    mode,
    ttlDays: options.ratingTtlDays,
    updated: 0,
    skippedFresh: 0,
    skippedMissingIdentity: 0,
    failed: 0,
    failures: [],
  };
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    for (const type of types) {
      let requested = 0;
      for (const [index, player] of snapshot.players.entries()) {
        const timestampField = type === "dsu" ? "dsuRatingUpdatedAt" : "fideRatingUpdatedAt";
        if (mode === "stale" && !isProviderRatingStale(player[timestampField], options.ratingTtlDays)) {
          summary.skippedFresh += 1;
          continue;
        }
        if (requested > 0 && options.throttleMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, options.throttleMs));
        process.stdout.write(`${type.toUpperCase()} ${index + 1}/${snapshot.players.length}: ${player.name}\n`);
        try {
          const result = type === "dsu"
            ? await fetchDsuProfile(page, player)
            : await fetchFideProfile(page, player);
          requested += 1;
          if (result.status === "skipped") {
            summary.skippedMissingIdentity += 1;
            process.stdout.write(`  skipped: ${result.reason}\n`);
            continue;
          }
          const updatedAt = new Date().toISOString();
          if (type === "dsu") {
            player.actualDsuRating = result.dsuRating;
            player.dsuRatingUpdatedAt = updatedAt;
            player.fideId = player.fideId ?? result.fideId;
            player.fideProfileUrl = player.fideProfileUrl ?? (player.fideId ? `https://ratings.fide.com/profile/${player.fideId}` : null);
          } else {
            player.actualFideRating = result.fideRating;
            player.fideRatingUpdatedAt = updatedAt;
            player.fideProfileUrl = result.profileUrl;
          }
          summary.updated += 1;
        } catch (error) {
          requested += 1;
          summary.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          summary.failures.push({ provider: type, player: player.name, message });
          process.stderr.write(`  skipped: ${message}\n`);
        }
      }
    }
    await saveSnapshot(options.snapshotPath, snapshot);
    await updateSyncState(options, "ratings", { completedAt: new Date().toISOString(), ...summary });
    return summary;
  } finally {
    await browser.close();
  }
}

export async function syncApp(options) {
  const snapshot = await readSnapshot(options.snapshotPath);
  assertSnapshotTarget(snapshot, options.nickname);
  const endpoint = new URL("/api/admin/tournaments/sync", options.appUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...snapshot,
      tournamentNickname: options.nickname,
      dryRun: options.dryRun,
      force: options.force,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || `App sync failed with HTTP ${response.status}.`);
  const counts = payload.participants;
  const verb = options.dryRun ? "Would sync" : "Synced";
  process.stdout.write(`${verb} ${counts.total} participants to ${payload.tournament.name}: ${counts.created} players created, ${counts.added} added, ${counts.removed} removed, ${counts.ratingChanges} rating changes.\n`);
  if (payload.safety?.requiresForce) {
    process.stdout.write(`Roster removal is ${payload.safety.removalPercent}% and requires --force to apply.\n`);
  }
  await updateSyncState(options, options.dryRun ? "lastDryRun" : "app", {
    completedAt: new Date().toISOString(),
    participants: counts,
  });
  return payload;
}

export async function syncGames(options) {
  const snapshot = await readSnapshot(options.snapshotPath);
  assertSnapshotTarget(snapshot, options.nickname);
  const outputDirectory = resolve(options.packsDir);
  await mkdir(outputDirectory, { recursive: true });
  const extraction = await extractOpponentPacks({
    inputPath: options.danbasePath,
    opponents: snapshot.players.map((player) => {
      const name = normalizeParticipantName(player.name);
      return {
        name,
        names: [
          ...danbaseNameVariants(name),
          ...(Array.isArray(player.danbaseAliases) ? player.danbaseAliases : []),
        ],
        outputPath: join(outputDirectory, packFilename(name)),
      };
    }),
  });
  process.stdout.write(`Scanned ${extraction.scanned} Danbase games once for ${snapshot.players.length} participants.\n`);

  let failures = 0;
  let packCount = 0;
  let noGamesCount = 0;
  let importedCount = 0;
  let duplicateCount = 0;
  let parseErrorCount = 0;
  let persistenceErrorCount = 0;
  let identityConflictCount = 0;
  for (const [index, player] of snapshot.players.entries()) {
    const name = normalizeParticipantName(player.name);
    process.stdout.write(`Games ${index + 1}/${snapshot.players.length}: ${name}\n`);
    const pack = extraction.opponents[index];
    try {
      if (!pack || pack.matched === 0) {
        noGamesCount += 1;
        process.stderr.write("  no Danbase games found.\n");
      } else if (options.dryRun) {
        packCount += 1;
        process.stdout.write(`  would upload ${pack.matched} extracted game(s) from ${pack.outputPath}.\n`);
      } else {
        packCount += 1;
        const uploaded = await uploadPack({
          baseUrl: options.appUrl,
          name,
          aliases: danbaseNameVariants(name),
          fideId: player.fideId ?? "",
          packPath: pack.outputPath,
          tournamentNickname: options.nickname,
        });
        importedCount += uploaded.import.importedCount;
        duplicateCount += uploaded.import.duplicateCount;
        parseErrorCount += uploaded.import.parseErrorCount;
        persistenceErrorCount += uploaded.import.persistenceErrorCount;
        identityConflictCount += uploaded.opponent?.conflictCount ?? 0;
        process.stdout.write(`  ${uploaded.import.importedCount} new, ${uploaded.import.duplicateCount} duplicate.\n`);
      }
    } catch (error) {
      failures += 1;
      process.stderr.write(`  failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  if (failures) throw new Error(`${failures} opponent game sync(s) failed.`);
  await updateSyncState(options, options.dryRun ? "gameDryRun" : "games", {
    completedAt: new Date().toISOString(),
    scannedGames: extraction.scanned,
    packCount,
    noGamesCount,
    importedCount,
    duplicateCount,
    parseErrorCount,
    persistenceErrorCount,
    identityConflictCount,
  });
  return {
    scannedGames: extraction.scanned,
    packCount,
    noGamesCount,
    importedCount,
    duplicateCount,
    parseErrorCount,
    persistenceErrorCount,
    identityConflictCount,
  };
}

function wait(milliseconds) {
  return milliseconds > 0
    ? new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
    : Promise.resolve();
}

export async function syncLichessGames(options) {
  const snapshot = await readSnapshot(options.snapshotPath);
  assertSnapshotTarget(snapshot, options.nickname);
  const players = snapshot.players.filter((player) => /^\d{4,12}$/.test(String(player.fideId ?? "").trim()));
  const lichessDirectory = resolve(options.packsDir, "lichess");
  const sourceDirectory = join(lichessDirectory, "sources");
  const playerDirectory = join(lichessDirectory, "players");
  await Promise.all([
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(playerDirectory, { recursive: true }),
  ]);

  const token = process.env.LICHESS_TOKEN || "";
  const references = new Map();
  const discoveryPlayers = [];
  let discoveryFailureCount = 0;

  for (const [index, player] of players.entries()) {
    const name = normalizeParticipantName(player.name);
    process.stdout.write(`Lichess discovery ${index + 1}/${players.length}: ${name} (${player.fideId})\n`);
    try {
      const found = (await fetchLichessFideBroadcasts(player.fideId, { token }))
        .slice(0, options.lichessMaxTournaments);
      discoveryPlayers.push({ fideId: player.fideId, name, broadcasts: found });
      for (const reference of found) references.set(reference.roundId, reference);
      process.stdout.write(`  ${found.length} recent broadcast(s).\n`);
    } catch (error) {
      if (error?.status === 429) throw error;
      discoveryFailureCount += 1;
      discoveryPlayers.push({
        fideId: player.fideId,
        name,
        broadcasts: [],
        error: error instanceof Error ? error.message : String(error),
      });
      process.stderr.write(`  discovery failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    if (index < players.length - 1) await wait(options.lichessThrottleMs);
  }

  const tours = new Map();
  let metadataFailureCount = 0;
  const uniqueReferences = [...references.values()];
  for (const [index, reference] of uniqueReferences.entries()) {
    try {
      const tour = await fetchLichessBroadcastTour(reference, { token });
      tours.set(tour.id, tour);
    } catch (error) {
      if (error?.status === 429) throw error;
      metadataFailureCount += 1;
      process.stderr.write(`Lichess broadcast metadata failed for ${reference.title}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    if (index < uniqueReferences.length - 1) await wait(options.lichessThrottleMs);
  }

  const sourcePgns = [];
  let downloadFailureCount = 0;
  const uniqueTours = [...tours.values()];
  for (const [index, tour] of uniqueTours.entries()) {
    const sourcePath = join(sourceDirectory, `${tour.id}.pgn`);
    const activityTimestamp = new Date(tour.lastActivityAt ?? "").valueOf();
    const isHistorical = Number.isFinite(activityTimestamp)
      && Date.now() - activityTimestamp > 14 * 24 * 60 * 60 * 1000;
    const cachedPgn = await readFile(sourcePath, "utf8").catch(() => null);
    try {
      const pgn = isHistorical && cachedPgn
        ? cachedPgn
        : await fetchLichessBroadcastPgn(tour.id, { token });
      if (pgn.trim()) {
        await writeFile(sourcePath, pgn.endsWith("\n") ? pgn : `${pgn}\n`, "utf8");
        sourcePgns.push(pgn.trim());
        process.stdout.write(`${isHistorical && cachedPgn ? "Reused" : "Downloaded"} Lichess broadcast: ${tour.name}\n`);
      }
    } catch (error) {
      if (error?.status === 429) throw error;
      if (cachedPgn?.trim()) {
        sourcePgns.push(cachedPgn.trim());
        process.stderr.write(`Lichess PGN refresh failed for ${tour.name}; reused the local copy.\n`);
      } else {
        downloadFailureCount += 1;
        process.stderr.write(`Lichess PGN download failed for ${tour.name}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    if (index < uniqueTours.length - 1) await wait(options.lichessThrottleMs);
  }

  const discoveryPath = join(dirname(resolve(options.snapshotPath)), "lichess-broadcasts.json");
  await saveSnapshot(discoveryPath, {
    version: 1,
    tournamentNickname: options.nickname,
    fetchedAt: new Date().toISOString(),
    players: discoveryPlayers,
    tours: uniqueTours,
  });

  const summary = {
    eligiblePlayerCount: players.length,
    discoveredRoundCount: references.size,
    discoveredTourCount: tours.size,
    downloadedTourCount: sourcePgns.length,
    discoveryFailureCount,
    metadataFailureCount,
    downloadFailureCount,
    packCount: 0,
    noGamesCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    parseErrorCount: 0,
    persistenceErrorCount: 0,
    identityConflictCount: 0,
  };

  if (sourcePgns.length === 0 || players.length === 0) {
    await updateSyncState(options, options.dryRun ? "lichessDryRun" : "lichess", {
      completedAt: new Date().toISOString(),
      ...summary,
    });
    return summary;
  }

  const combinedPath = join(lichessDirectory, "broadcasts.pgn");
  await writeFile(combinedPath, `${sourcePgns.join("\n\n")}\n`, "utf8");
  const extraction = await extractOpponentPacks({
    inputPath: combinedPath,
    opponents: players.map((player) => {
      const name = normalizeParticipantName(player.name);
      return {
        name,
        names: danbaseNameVariants(name),
        fideIds: [player.fideId],
        skipGamesWithoutMoves: true,
        outputPath: join(playerDirectory, packFilename(name)),
      };
    }),
  });

  let uploadFailures = 0;
  for (const [index, player] of players.entries()) {
    const name = normalizeParticipantName(player.name);
    const pack = extraction.opponents[index];
    process.stdout.write(`Lichess games ${index + 1}/${players.length}: ${name}\n`);
    try {
      if (!pack || pack.matched === 0) {
        summary.noGamesCount += 1;
        process.stdout.write("  no matching broadcast games found.\n");
      } else if (options.dryRun) {
        summary.packCount += 1;
        process.stdout.write(`  would upload ${pack.matched} Lichess game(s) from ${pack.outputPath}.\n`);
      } else {
        summary.packCount += 1;
        const uploaded = await uploadPack({
          baseUrl: options.appUrl,
          name,
          aliases: danbaseNameVariants(name),
          fideId: player.fideId,
          packPath: pack.outputPath,
          sourceLabel: "Lichess Broadcasts",
          tournamentNickname: options.nickname,
        });
        summary.importedCount += uploaded.import.importedCount;
        summary.duplicateCount += uploaded.import.duplicateCount;
        summary.parseErrorCount += uploaded.import.parseErrorCount;
        summary.persistenceErrorCount += uploaded.import.persistenceErrorCount;
        summary.identityConflictCount += uploaded.opponent?.conflictCount ?? 0;
        process.stdout.write(`  ${uploaded.import.importedCount} new, ${uploaded.import.duplicateCount} duplicate.\n`);
      }
    } catch (error) {
      uploadFailures += 1;
      process.stderr.write(`  failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  if (uploadFailures) throw new Error(`${uploadFailures} Lichess opponent upload(s) failed.`);
  await updateSyncState(options, options.dryRun ? "lichessDryRun" : "lichess", {
    completedAt: new Date().toISOString(),
    ...summary,
  });
  return summary;
}

function usage() {
  return `Synchronize a Danish tournament and its Danbase/Lichess games.\n\nUsage:\n  npm run sync-tournament -- <nickname>\n  npm run sync-tournament -- <nickname> --ratings\n  npm run sync-tournament -- <nickname> --ratings=stale\n  npm run sync-tournament -- <nickname> --lichess\n  npm run sync-tournament -- <nickname> --dry-run\n  npm run sync-participants -- <nickname>\n  npm run sync-ratings -- <nickname>\n  npm run sync-app -- <nickname>\n  npm run sync-games -- <nickname> --lichess\n  npm run sync-lichess -- <nickname>\n\nThe nickname loads that exact tournament even when it is inactive. Omit it to\nuse the active tournament. Rating updates and Lichess discovery are skipped by\nthe normal full sync unless explicitly requested. LICHESS_TOKEN is optional but\nrecommended if unauthenticated API requests become rate-limited.\n\nCommands: all, participants, dsu, fide, ratings, app, games, lichess\nOptions:\n  -f, --file <path>       Override the per-tournament local snapshot\n  -u, --url <url>         Override the saved tournament URL for this run\n      --ratings           Refresh every DSU and FIDE rating\n      --ratings=stale     Refresh only provider ratings older than the TTL\n      --rating-ttl-days   Stale rating age (default: ${DEFAULT_RATING_TTL_DAYS})\n      --danbase <path>    Danbase PGN (default: ${DEFAULT_DANBASE})\n      --lichess           Also discover and import recent Lichess broadcasts\n      --lichess-max-tournaments <n>  Recent tournaments per player (default: 3)\n      --lichess-throttle <ms>        Delay between Lichess requests (default: 750)\n      --app-url <url>     Target app (default: OPPONENT_BROWSER_URL or Production)\n      --packs-dir <path>  Override the per-tournament PGN packs folder\n      --dry-run           Plan app changes and extract packs without uploading\n      --force             Allow a large participant-roster removal\n      --throttle <ms>     Delay between rating pages (default: 2500)\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const parsedOptions = parseArguments(argv);
  if (parsedOptions.help) return process.stdout.write(usage());
  const options = await configureWorkspace(parsedOptions);
  const run = options.dryRun ? null : await startSyncRun(options);
  const summary = { stages: {} };
  try {
    if (options.command === "participants") {
      const snapshot = await refreshParticipants(options);
      summary.stages.participants = { count: snapshot.players.length };
    } else if (options.command === "dsu") {
      summary.stages.ratings = await refreshRatings(options, ["dsu"]);
    } else if (options.command === "fide") {
      summary.stages.ratings = await refreshRatings(options, ["fide"]);
    } else if (options.command === "ratings") {
      summary.stages.ratings = await refreshRatings(options, ["dsu", "fide"]);
    } else if (options.command === "app") {
      summary.stages.participants = (await syncApp(options)).participants;
    } else if (options.command === "games") {
      summary.stages.games = await syncGames(options);
      if (options.includeLichess) summary.stages.lichess = await syncLichessGames(options);
    } else if (options.command === "lichess") {
      summary.stages.lichess = await syncLichessGames(options);
    } else {
      const snapshot = await refreshParticipants(options);
      summary.stages.participantsFetch = { count: snapshot.players.length };
      if (options.includeRatings) summary.stages.ratings = await refreshRatings(options, ["dsu", "fide"]);
      summary.stages.participants = (await syncApp(options)).participants;
      summary.stages.games = await syncGames(options);
      if (options.includeLichess) summary.stages.lichess = await syncLichessGames(options);
    }

    const ratingFailures = summary.stages.ratings?.failed ?? 0;
    const gameErrors = (summary.stages.games?.parseErrorCount ?? 0)
      + (summary.stages.games?.persistenceErrorCount ?? 0)
      + (summary.stages.games?.identityConflictCount ?? 0);
    const lichessErrors = (summary.stages.lichess?.discoveryFailureCount ?? 0)
      + (summary.stages.lichess?.metadataFailureCount ?? 0)
      + (summary.stages.lichess?.downloadFailureCount ?? 0)
      + (summary.stages.lichess?.parseErrorCount ?? 0)
      + (summary.stages.lichess?.persistenceErrorCount ?? 0)
      + (summary.stages.lichess?.identityConflictCount ?? 0);
    const issueCount = ratingFailures + gameErrors + lichessErrors;
    if (run) {
      await finishSyncRun(
        options,
        run,
        issueCount ? "completed_with_errors" : "completed",
        summary,
        issueCount ? `${issueCount} rating/import issue(s) require review.` : null,
      );
    }
    return summary;
  } catch (error) {
    if (run) {
      await finishSyncRun(
        options,
        run,
        "failed",
        summary,
        error instanceof Error ? error.message : String(error),
      ).catch((finishError) => process.stderr.write(`Could not record failed sync: ${finishError instanceof Error ? finishError.message : String(finishError)}\n`));
    }
    throw error;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((error) => {
  process.stderr.write(`sync-tournament: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
