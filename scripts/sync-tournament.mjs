#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { packFilename, uploadPack } from "./add-opponents.mjs";
import { extractOpponentPacks } from "./extract-opponent.mjs";

const DEFAULT_SNAPSHOT = "data/participants.json";
const DEFAULT_DANBASE = "C:/dev/danbase.pgn";
const DEFAULT_APP_URL = "https://chess-opponent-browser.vercel.app";
const DEFAULT_TOURNAMENT_URL = "https://turnering.skak.dk/TournamentActive/Details?tourId=30508";
const COMMANDS = new Set(["all", "participants", "dsu", "fide", "ratings", "app", "games"]);

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
  const parts = withoutTitle.split(" ");
  if (parts.length > 1) {
    const surname = parts.at(-1);
    const givenNames = parts.slice(0, -1).join(" ");
    variants.add(`${surname}, ${givenNames}`);
    variants.add(`${surname},${givenNames}`);
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
    snapshotPath: DEFAULT_SNAPSHOT,
    tournamentUrl: "",
    danbasePath: DEFAULT_DANBASE,
    appUrl: process.env.OPPONENT_BROWSER_URL || DEFAULT_APP_URL,
    packsDir: "packs",
    throttleMs: 2500,
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
    else if (["--file", "-f", "--url", "-u", "--danbase", "--input", "-i", "--app-url", "--packs-dir", "--throttle"].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      if (argument === "--file" || argument === "-f") options.snapshotPath = value;
      else if (argument === "--url" || argument === "-u") options.tournamentUrl = value;
      else if (["--danbase", "--input", "-i"].includes(argument)) options.danbasePath = value;
      else if (argument === "--app-url") options.appUrl = value;
      else if (argument === "--packs-dir") options.packsDir = value;
      else options.throttleMs = Number(value);
    } else if (!argument.startsWith("-") && !options.nickname) {
      options.nickname = argument.trim().toLowerCase();
    } else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isFinite(options.throttleMs) || options.throttleMs < 0) {
    throw new Error("--throttle must be a non-negative number.");
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
  if (!payload.tournament.isActive) {
    throw new Error(`Tournament '${payload.tournament.nickname}' is not active. Make it active in Admin before syncing.`);
  }
  if (!payload.tournament.sourceUrl && !options.tournamentUrl) {
    throw new Error(`Tournament '${payload.tournament.nickname}' has no source URL.`);
  }
  return payload.tournament;
}

export async function readSnapshot(filePath) {
  const parsed = JSON.parse(await readFile(resolve(filePath), "utf8"));
  if (Array.isArray(parsed)) return { version: 1, sourceUrl: null, extractedAt: null, ratingsUpdatedAt: null, players: parsed };
  if (!parsed || !Array.isArray(parsed.players)) throw new Error("Snapshot must contain a players array.");
  return parsed;
}

async function saveSnapshot(filePath, snapshot) {
  const target = resolve(filePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return target;
}

async function launchBrowser() {
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
}

async function openParticipantTable(page, url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("ul.tabs a", { timeout: 15000 });
  const count = await page.$$eval("ul.tabs a", (tabs) => tabs.length);
  if (!count) throw new Error("No tournament tabs found.");
  await page.click(`ul.tabs li:nth-child(${count}) a`);
  await page.waitForSelector("#tour-players table", { timeout: 15000 });
}

async function extractVisibleParticipants(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const normalize = (value) => clean(value).toLowerCase();
    const tables = Array.from(document.querySelectorAll("#tour-players table")).filter((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalize(th.textContent));
      return headers.includes("navn") && headers.includes("rating (std.)");
    });

    return tables.flatMap((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalize(th.textContent));
      const at = (name) => headers.indexOf(name);
      const group = clean(table.querySelector("caption")?.textContent).replace(/^Deltagere i gruppen\s*/i, "").trim();
      return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const name = clean(cells[at("navn")]?.textContent);
        if (!name) return null;
        const dsuCell = cells[at("dsu")];
        const fideCell = cells[at("fide")];
        const dsuLink = dsuCell?.querySelector("a[href]");
        const fideLink = fideCell?.querySelector("a[href]");
        return {
          name,
          group: group || null,
          dsuId: clean(dsuCell?.textContent) || null,
          fideId: clean(fideCell?.textContent).replace(/^-$/, "") || null,
          club: at("klubber") >= 0 ? clean(cells[at("klubber")]?.textContent) || null : null,
          tournamentDsuRating: at("rating (std.)") >= 0 ? clean(cells[at("rating (std.)")]?.textContent) : null,
          tournamentFideRating: at("fide rating") >= 0 ? clean(cells[at("fide rating")]?.textContent) : null,
          registeredAt: at("tilmeldt") >= 0 ? clean(cells[at("tilmeldt")]?.textContent) || null : null,
          dsuProfileUrl: dsuLink ? new URL(dsuLink.getAttribute("href"), document.baseURI).href : null,
          fideProfileUrl: fideLink ? new URL(fideLink.getAttribute("href"), document.baseURI).href : null,
        };
      }).filter(Boolean);
    });
  });
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
    for (const raw of await extractVisibleParticipants(page)) {
      const player = {
        ...raw,
        name: normalizeParticipantName(raw.name),
        tournamentDsuRating: toRating(raw.tournamentDsuRating),
        tournamentFideRating: toRating(raw.tournamentFideRating),
        actualDsuRating: null,
        actualFideRating: null,
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
  const tournament = await fetchTournamentConfig(options);
  const sourceUrl = options.tournamentUrl || tournament.sourceUrl || previous.sourceUrl || DEFAULT_TOURNAMENT_URL;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await openParticipantTable(page, sourceUrl);
    const extracted = await extractAllParticipants(page);
    const selected = filterParticipantsByGroup(extracted, tournament.participantGroup);
    if (tournament.participantGroup && selected.length === 0) {
      const available = [...new Set(extracted.map((player) => player.group).filter(Boolean))].join(", ");
      throw new Error(`No participants matched group '${tournament.participantGroup}'. Available groups: ${available || "none"}.`);
    }
    const players = mergeParticipants(previous.players, selected);
    const snapshot = {
      version: 1,
      tournamentNickname: tournament.nickname,
      participantGroup: tournament.participantGroup,
      sourceUrl,
      extractedAt: new Date().toISOString(),
      ratingsUpdatedAt: previous.ratingsUpdatedAt ?? null,
      players,
    };
    const target = await saveSnapshot(options.snapshotPath, snapshot);
    process.stdout.write(`Saved ${players.length} participants to ${target}.\n`);
    return snapshot;
  } finally {
    await browser.close();
  }
}

async function fetchDsuProfile(page, player) {
  if (!player.dsuProfileUrl) return;
  await page.goto(player.dsuProfileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#medlem-detaljer table", { timeout: 10000 });
  const values = await page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const valueAfter = (label) => {
      const header = Array.from(document.querySelectorAll("#medlem-detaljer th")).find((th) => clean(th.textContent).toLowerCase() === label.toLowerCase());
      if (!header) return "";
      const cells = Array.from(header.parentElement.children);
      return clean(cells[cells.indexOf(header) + 1]?.textContent);
    };
    return { dsu: valueAfter("Dansk rating"), fide: valueAfter("Fide rating"), fideId: valueAfter("Fide nummer") };
  });
  player.actualDsuRating = toRating(values.dsu);
  player.actualFideRating = toRating(values.fide) ?? player.actualFideRating;
  player.fideId = player.fideId ?? (values.fideId || null);
  player.fideProfileUrl = player.fideProfileUrl ?? (player.fideId ? `https://ratings.fide.com/profile/${player.fideId}` : null);
}

async function fetchFideProfile(page, player) {
  const url = player.fideProfileUrl ?? (player.fideId ? `https://ratings.fide.com/profile/${player.fideId}` : null);
  if (!url) return;
  player.fideProfileUrl = url;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const rating = await page.evaluate(() => {
    const text = (document.querySelector("section.directory")?.textContent || document.body.textContent || "").replace(/\s+/g, " ");
    return text.match(/(\d{3,4}|Not rated)\s*STANDARD/i)?.[1] || "";
  });
  player.actualFideRating = toRating(rating);
}

export async function refreshRatings(options, types) {
  const snapshot = await readSnapshot(options.snapshotPath);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    for (const type of types) {
      for (const [index, player] of snapshot.players.entries()) {
        if (index > 0 && options.throttleMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, options.throttleMs));
        process.stdout.write(`${type.toUpperCase()} ${index + 1}/${snapshot.players.length}: ${player.name}\n`);
        try {
          if (type === "dsu") await fetchDsuProfile(page, player);
          else await fetchFideProfile(page, player);
        } catch (error) {
          process.stderr.write(`  skipped: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    }
    snapshot.ratingsUpdatedAt = new Date().toISOString();
    await saveSnapshot(options.snapshotPath, snapshot);
    return snapshot;
  } finally {
    await browser.close();
  }
}

export async function syncApp(options) {
  const snapshot = await readSnapshot(options.snapshotPath);
  const endpoint = new URL("/api/admin/tournaments/sync", options.appUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...snapshot,
      tournamentNickname: options.nickname || snapshot.tournamentNickname || null,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || `App sync failed with HTTP ${response.status}.`);
  const counts = payload.participants;
  process.stdout.write(`Synced ${counts.total} participants to ${payload.tournament.name}: ${counts.created} players created, ${counts.added} added, ${counts.removed} removed.\n`);
  return payload;
}

export async function syncGames(options) {
  const snapshot = await readSnapshot(options.snapshotPath);
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
  for (const [index, player] of snapshot.players.entries()) {
    const name = normalizeParticipantName(player.name);
    process.stdout.write(`Games ${index + 1}/${snapshot.players.length}: ${name}\n`);
    const pack = extraction.opponents[index];
    try {
      if (!pack || pack.matched === 0) {
        process.stderr.write("  no Danbase games found.\n");
      } else {
        const uploaded = await uploadPack({
          baseUrl: options.appUrl,
          name,
          aliases: danbaseNameVariants(name),
          packPath: pack.outputPath,
        });
        process.stdout.write(`  ${uploaded.import.importedCount} new, ${uploaded.import.duplicateCount} duplicate.\n`);
      }
    } catch (error) {
      failures += 1;
      process.stderr.write(`  failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  if (failures) throw new Error(`${failures} opponent game sync(s) failed.`);
}

function usage() {
  return `Synchronize a Danish tournament, ratings, and Danbase games.\n\nUsage:\n  npm run sync-tournament -- <nickname>\n  npm run sync-participants -- <nickname>\n  npm run sync-ratings -- <nickname>\n  npm run sync-app -- <nickname>\n  npm run sync-games -- <nickname>\n\nThe nickname loads the active tournament URL and optional group from the app.\nOmit it to use the active tournament directly.\n\nCommands: all, participants, dsu, fide, ratings, app, games\nOptions:\n  -f, --file <path>       Local snapshot (default: ${DEFAULT_SNAPSHOT})\n  -u, --url <url>         Override the saved tournament URL for this run\n      --danbase <path>    Danbase PGN (default: ${DEFAULT_DANBASE})\n      --app-url <url>     Target app (default: OPPONENT_BROWSER_URL or Production)\n      --packs-dir <path>  Local PGN packs (default: packs)\n      --throttle <ms>     Delay between rating pages (default: 2500)\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) return process.stdout.write(usage());
  if (options.command === "participants") return refreshParticipants(options);
  if (options.command === "dsu") return refreshRatings(options, ["dsu"]);
  if (options.command === "fide") return refreshRatings(options, ["fide"]);
  if (options.command === "ratings") return refreshRatings(options, ["dsu", "fide"]);
  if (options.command === "app") return syncApp(options);
  if (options.command === "games") return syncGames(options);

  await refreshParticipants(options);
  await refreshRatings(options, ["dsu", "fide"]);
  await syncApp(options);
  await syncGames(options);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch((error) => {
  process.stderr.write(`sync-tournament: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
