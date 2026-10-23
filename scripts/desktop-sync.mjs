import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import nextEnv from '@next/env';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Load the shared schema and PGN parser without adding a second TS runtime to
// the web application's dependencies. The hook exists only during these loads.
function sharedModules() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8').replace(/^import "server-only";\r?\n/m, '');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename });
    module._compile(outputText, filename);
  };
  try {
    return {
      ...require('../desktop/db.ts'),
      ...require('../lib/imports/pgn.ts'),
      ...require('../lib/imports/fingerprint.ts'),
    };
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const canonicalPgn = text => text.replace(/\r\n?/g, '\n').trim();
const digest = text => createHash('md5').update(canonicalPgn(text)).digest('hex');
const nameKey = name => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const quote = name => `"${name.replaceAll('"', '""')}"`;
const sqliteValue = value => value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? Number(value) : value;
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export function* localPgnSegments(input) {
  const normalized = input.replace(/\r\n?/g, '\n');
  const tag = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/;
  let start = 0;
  let seenMoves = false;
  let seenTag = false;
  for (const match of normalized.matchAll(/[^\n]*\n|[^\n]+$/g)) {
    const line = match[0].trim();
    const isTag = tag.test(line);
    if (isTag && seenMoves) {
      yield normalized.slice(start, match.index).trim();
      start = match.index;
      seenMoves = false;
    }
    if (isTag) seenTag = true;
    else if (seenTag && line && !line.startsWith('%')) seenMoves = true;
  }
  if (normalized.slice(start).trim()) yield normalized.slice(start).trim();
}

function pgnFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? pgnFiles(filename) : entry.name.endsWith('.pgn') ? [filename] : [];
  });
}

function tagsFromPgn(pgn) {
  return Object.fromEntries([...pgn.matchAll(/^\s*\[(\w+)\s+"((?:\\.|[^"\\])*)"\]\s*$/gm)]
    .map(match => [match[1], match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')]));
}

function optionsFrom(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--database', '--connection-file', '--nickname', '--cache-dir', '--local-pgn'].includes(argv[i]) || !argv[i + 1]) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    options[argv[i].slice(2)] = argv[i + 1];
  }
  return options;
}

export async function syncDesktop(options = {}) {
  nextEnv.loadEnvConfig(root);
  let databaseUrl = process.env.DATABASE_URL;
  if (options['connection-file']) {
    const filename = path.resolve(options['connection-file']);
    databaseUrl = JSON.parse(readFileSync(filename, 'utf8')).databaseUrl;
    // Connection files supplied by the agent are deliberately short lived.
    unlinkSync(filename);
  }
  if (!databaseUrl) throw new Error('Set DATABASE_URL for the source web database. The desktop app never stores or uses this credential.');
  const sql = neon(databaseUrl);
  const read = async (query, params = []) => {
    if (!/^\s*select\b/i.test(query)) throw new Error('The web database is read-only during desktop synchronization');
    const [rows] = await sql.transaction([sql.query(query, params)], { readOnly: true });
    return rows;
  };
  const [tournament] = await read(`select id, name, nickname, source_url, participant_group, archived_at, created_at from tournaments where ${options.nickname ? 'nickname = $1' : 'is_active = true'}`, options.nickname ? [options.nickname] : []);
  if (!tournament || tournament.archived_at) throw new Error('No available active web tournament was found');
  const cache = options['cache-dir'] ? path.resolve(options['cache-dir']) : path.join(root, 'data/desktop-sync', tournament.nickname);
  mkdirSync(cache, { recursive: true });
  const shared = sharedModules();
  const filename = path.resolve(options.database ?? process.env.CHESS_SQLITE_PATH ?? path.join(process.platform === 'win32' ? process.env.APPDATA : process.platform === 'darwin' ? path.join(homedir(), 'Library/Application Support') : path.join(homedir(), '.config'), 'chess-opponent-browser-desktop/chess.sqlite'));
  const { createSqliteClient } = require('../desktop/sqlite.cjs');
  const client = createSqliteClient(filename, shared.desktopSchema());
  const db = client.connection;
  try {
    const backup = path.join(cache, `before-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
    db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
    console.log(`Local database: ${filename}\nBackup: ${backup}`);
    const columns = table => db.prepare(`pragma table_info(${quote(table)})`).all().map(c => c.name);
    const gameColumns = columns('games').filter(column => !['original_pgn', 'structured_moves'].includes(column));
    const roster = await read(`select ${columns('tournament_participants').map(quote)} from tournament_participants where tournament_id = $1 order by id`, [tournament.id]);
    const manifest = await read(`select ${gameColumns.map(column => `g.${quote(column)}`)}, md5(btrim(replace(replace(g.original_pgn, chr(13)||chr(10), chr(10)), chr(13), chr(10)), chr(9)||chr(10)||chr(13)||' ')) as pgn_hash
      from games g where exists(select 1 from tournament_participants tp where tp.tournament_id=$1 and tp.player_id in (g.white_player_id,g.black_player_id)) order by g.id`, [tournament.id]);
    console.log(`${tournament.name}: ${roster.length} participants, ${manifest.length} games in the web database.`);
    const playerIds = [...new Set([...roster.map(row => row.player_id), ...manifest.flatMap(game => [game.white_player_id, game.black_player_id])].filter(id => id !== null))];
    const remotePlayers = [];
    const aliases = [];
    for (const batch of chunks(playerIds, 500)) {
      remotePlayers.push(...await read(`select ${columns('players').map(quote)} from players where id = any($1::int[]) order by id`, [batch]));
      aliases.push(...await read(`select ${columns('player_aliases').map(quote)} from player_aliases where player_id = any($1::int[]) order by id`, [batch]));
    }
    const sources = await read(`select ${columns('game_sources').map(quote)} from game_sources where id = any($1::int[]) order by id`, [[...new Set(manifest.map(g => g.source_id))]]);
    writeFileSync(path.join(cache, 'web-metadata.json'), JSON.stringify({ tournament, roster, players: remotePlayers, aliases, sources, manifest }));

    const provenanceKey = `desktop-sync:${new URL(databaseUrl).hostname}:${tournament.id}`;
    if (provenanceKey.length > 128) throw new Error('Source identifier is too long');
    const saved = db.prepare('select value from app_metadata where key = ?').get(provenanceKey);
    const maps = saved ? JSON.parse(saved.value) : { players: {}, sources: {}, games: {} };
    const localGames = db.prepare('select id, duplicate_fingerprint, move_fingerprint, source_id, source_game_key, original_pgn from games').all();
    const byGameId = new Map(localGames.map(g => [g.id, g]));
    const byContent = new Map(localGames.filter(g => g.duplicate_fingerprint).map(g => [g.duplicate_fingerprint, g.id]));
    const byMoves = new Map(localGames.filter(g => g.move_fingerprint).map(g => [g.move_fingerprint, g.id]));
    const byPgn = new Map(localGames.map(g => [digest(g.original_pgn), g.id]));
    const existingGames = new Map();
    const claimedGames = new Set();
    for (const game of manifest) {
      const match = (byGameId.has(maps.games[game.id]) ? maps.games[game.id] : null)
        ?? byContent.get(game.duplicate_fingerprint) ?? byMoves.get(game.move_fingerprint) ?? byPgn.get(game.pgn_hash);
      // Distinct web rows can deliberately lack a fingerprint. Do not merge
      // them just because their PGN or newly resolved move identity is equal.
      if (match && !claimedGames.has(match)) {
        existingGames.set(game.id, match);
        claimedGames.add(match);
      }
    }
    const needed = manifest.filter(g => !existingGames.has(g.id));
    const wanted = new Set(needed.map(g => g.pgn_hash));
    const localPgn = new Map();
    let scannedFiles = 0;
    const files = options['local-pgn'] ? [path.resolve(options['local-pgn'])] : [
      ...pgnFiles(path.join(root, 'packs', tournament.nickname)),
      ...pgnFiles(path.join(root, 'packs')).filter(file => !file.startsWith(path.join(root, 'packs', tournament.nickname) + path.sep)),
      path.join(root, 'data/danbase.pgn'),
    ];
    for (const file of files) {
      if (localPgn.size === wanted.size) break;
      if (!existsSync(file)) continue;
      scannedFiles++;
      for (const pgn of localPgnSegments(readFileSync(file, 'utf8'))) {
        const hash = digest(pgn);
        if (wanted.has(hash) && !localPgn.has(hash)) localPgn.set(hash, pgn);
      }
    }
    console.log(`Reusing ${existingGames.size} SQLite games; found ${localPgn.size} matching PGNs in ${scannedFiles} local files.`);

    const bodiesFile = path.join(cache, 'downloaded-game-bodies.json');
    const downloaded = existsSync(bodiesFile) ? JSON.parse(readFileSync(bodiesFile, 'utf8')) : {};
    const prepared = new Map();
    const missing = [];
    let parsedLocally = 0;
    for (const game of needed) {
      const pgn = localPgn.get(game.pgn_hash);
      if (pgn) {
        const preview = shared.parsePgnPreview(pgn);
        if (preview.games.length === 1 && !preview.errors.length) {
          prepared.set(game.id, { original_pgn: pgn, structured_moves: preview.games[0].structuredMoves });
          parsedLocally++;
          if (parsedLocally % 1000 === 0) console.log(`Parsed ${parsedLocally} local games...`);
          continue;
        }
      }
      const cached = downloaded[game.id];
      if (cached && digest(cached.original_pgn) === game.pgn_hash) prepared.set(game.id, cached);
      else missing.push(game.id);
    }
    console.log(`Downloading ${missing.length} missing game bodies; ${parsedLocally} rebuilt from local PGNs.`);
    for (const batch of chunks(missing, 100)) {
      const rows = await read('select id, original_pgn, structured_moves from games where id = any($1::int[]) order by id', [batch]);
      for (const row of rows) { prepared.set(row.id, row); downloaded[row.id] = row; }
      writeFileSync(bodiesFile, JSON.stringify(downloaded));
      console.log(`Downloaded ${Object.keys(downloaded).length} game bodies into the local cache.`);
    }
    for (const game of needed) {
      const body = prepared.get(game.id);
      if (!body || digest(body.original_pgn) !== game.pgn_hash) throw new Error(`Web game ${game.id} changed during synchronization. Retry to get a consistent copy.`);
    }
    // Recheck the small roster before committing a potentially long download.
    const currentRoster = await read('select player_id from tournament_participants where tournament_id=$1 order by player_id', [tournament.id]);
    if (JSON.stringify(currentRoster.map(r => r.player_id)) !== JSON.stringify(roster.map(r => r.player_id).sort((a, b) => a - b))) throw new Error('The web roster changed during synchronization; retry.');

    const snapshotFile = path.join(root, 'data/tournaments', tournament.nickname, 'participants.json');
    const snapshot = existsSync(snapshotFile) ? JSON.parse(readFileSync(snapshotFile, 'utf8')) : { players: [] };
    const snapshotPlayer = player => snapshot.players.find(p => (p.fideId && p.fideId === player.fide_id) || (p.dsuId && p.dsuId === player.dsu_id)
      || (nameKey(p.name) === nameKey(player.name) && (!p.fideId || !player.fide_id || p.fideId === player.fide_id) && (!p.dsuId || !player.dsu_id || p.dsuId === player.dsu_id)));
    const insert = (table, row) => {
      const keys = columns(table).filter(column => column !== 'id' && row[column] !== undefined);
      const values = keys.map(key => sqliteValue(row[key]));
      try {
        return Number(db.prepare(`insert into ${quote(table)} (${keys.map(quote)}) values (${keys.map(() => '?')}) returning id`).get(...values).id);
      } catch (error) {
        throw new Error(`Could not insert ${table}: ${error.message}`, { cause: error });
      }
    };
    const fillMissing = (table, id, row) => {
      const keys = columns(table).filter(column => !['id', 'is_active'].includes(column) && row[column] !== undefined && row[column] !== null);
      if (keys.length) db.prepare(`update ${quote(table)} set ${keys.map(key => `${quote(key)} = coalesce(${quote(key)}, ?)`)} where id = ?`).run(...keys.map(key => sqliteValue(row[key])), id);
    };
    const summary = { tournament: tournament.name, nickname: tournament.nickname, participants: roster.length, webGames: manifest.length, sqliteGamesReused: existingGames.size, localPgnGames: parsedLocally, downloadedGames: missing.length, gamesAdded: 0, playersAdded: 0, aliasesSkipped: 0, database: filename, backup };
    const startedAt = new Date().toISOString();
    db.exec('begin immediate');
    try {
      db.prepare('update tournaments set is_active = 0 where is_active = 1').run();
      let localTournament = db.prepare('select id from tournaments where nickname = ?').get(tournament.nickname)?.id;
      if (!localTournament) localTournament = insert('tournaments', { ...tournament, is_active: false });
      else fillMissing('tournaments', localTournament, tournament);
      db.prepare('update tournaments set is_active = 1, archived_at = null where id = ?').run(localTournament);
      for (const source of sources) {
        const match = db.prepare('select id from game_sources where source_key = ?').get(source.source_key);
        maps.sources[source.id] = match?.id ?? insert('game_sources', source);
      }
      const localPlayers = db.prepare('select * from players').all();
      const playerById = new Map(localPlayers.map(p => [p.id, p]));
      const playerByFide = new Map(localPlayers.filter(p => p.fide_id).map(p => [p.fide_id, p]));
      const playerByDsu = new Map(localPlayers.filter(p => p.dsu_id).map(p => [p.dsu_id, p]));
      const playerByName = new Map();
      for (const p of localPlayers) { const key = nameKey(p.name); playerByName.set(key, [...(playerByName.get(key) ?? []), p]); }
      for (const player of remotePlayers) {
        const local = snapshotPlayer(player);
        const values = { ...player, ...(local ? { name: local.name, current_dsu_rating: local.actualDsuRating ?? player.current_dsu_rating, current_fide_rating: local.actualFideRating ?? player.current_fide_rating, dsu_profile_url: local.dsuProfileUrl ?? player.dsu_profile_url, fide_profile_url: local.fideProfileUrl ?? player.fide_profile_url, dsu_rating_updated_at: local.dsuRatingUpdatedAt ?? player.dsu_rating_updated_at, fide_rating_updated_at: local.fideRatingUpdatedAt ?? player.fide_rating_updated_at } : {}) };
        const fideMatch = playerByFide.get(player.fide_id);
        const dsuMatch = playerByDsu.get(player.dsu_id);
        if (fideMatch && dsuMatch && fideMatch.id !== dsuMatch.id) throw new Error(`Local DSU/FIDE identities conflict for ${player.name}`);
        const named = (playerByName.get(nameKey(values.name)) ?? []).filter(p => (!p.fide_id || !player.fide_id || p.fide_id === player.fide_id) && (!p.dsu_id || !player.dsu_id || p.dsu_id === player.dsu_id));
        const match = fideMatch ?? dsuMatch ?? playerById.get(maps.players[player.id]) ?? (named.length === 1 ? named[0] : null);
        if (match && ((match.fide_id && player.fide_id && match.fide_id !== player.fide_id) || (match.dsu_id && player.dsu_id && match.dsu_id !== player.dsu_id))) throw new Error(`Local identity conflicts for ${player.name}`);
        if (match) { maps.players[player.id] = match.id; fillMissing('players', match.id, values); }
        else {
          const id = insert('players', values);
          maps.players[player.id] = id;
          summary.playersAdded++;
          const added = { ...values, id };
          playerById.set(id, added);
          if (added.fide_id) playerByFide.set(added.fide_id, added);
          if (added.dsu_id) playerByDsu.set(added.dsu_id, added);
          const key = nameKey(added.name);
          playerByName.set(key, [...(playerByName.get(key) ?? []), added]);
        }
      }
      const remotePlayerById = new Map(remotePlayers.map(p => [p.id, p]));
      for (const row of roster) {
        const local = snapshotPlayer(remotePlayerById.get(row.player_id));
        const values = { ...row, tournament_id: localTournament, player_id: maps.players[row.player_id], ...(local ? { rating: local.actualDsuRating ?? local.actualFideRating ?? row.rating, group_name: local.group ?? row.group_name, club: local.club ?? row.club, tournament_dsu_rating: local.tournamentDsuRating ?? row.tournament_dsu_rating, tournament_fide_rating: local.tournamentFideRating ?? row.tournament_fide_rating, registered_at_text: local.registeredAt ?? row.registered_at_text } : {}) };
        const existing = db.prepare('select id from tournament_participants where tournament_id = ? and player_id = ?').get(localTournament, values.player_id);
        if (existing) fillMissing('tournament_participants', existing.id, values);
        else insert('tournament_participants', values);
      }
      for (const alias of aliases) {
        const playerId = maps.players[alias.player_id];
        const existing = db.prepare('select player_id from player_aliases where normalized_key = ?').get(alias.normalized_key);
        if (!existing) insert('player_aliases', { ...alias, player_id: playerId });
        else if (existing.player_id !== playerId) summary.aliasesSkipped++;
      }
      const importGroups = new Map();
      for (const game of manifest) {
        const identities = { whitePlayerId: game.white_player_id === null ? null : maps.players[game.white_player_id], blackPlayerId: game.black_player_id === null ? null : maps.players[game.black_player_id], whiteFideId: game.white_player_id === null ? null : remotePlayerById.get(game.white_player_id)?.fide_id, blackFideId: game.black_player_id === null ? null : remotePlayerById.get(game.black_player_id)?.fide_id };
        const values = { ...game, source_id: maps.sources[game.source_id], white_player_id: identities.whitePlayerId, black_player_id: identities.blackPlayerId };
        delete values.pgn_hash;
        let existing = existingGames.get(game.id);
        if (existing) {
          // Existing local PGNs, annotations and resolved identities win.
          const fill = { ...values };
          delete fill.move_fingerprint;
          delete fill.duplicate_fingerprint;
          fillMissing('games', existing, fill);
        } else {
          const body = prepared.get(game.id);
          values.original_pgn = body.original_pgn;
          values.structured_moves = JSON.stringify(body.structured_moves);
          values.move_fingerprint = game.move_fingerprint ? shared.createMoveFingerprint({ whiteFideId: game.white_fide_id, blackFideId: game.black_fide_id, structuredMoves: body.structured_moves, result: game.result }, identities) : null;
          existing = values.duplicate_fingerprint ? db.prepare('select id from games where duplicate_fingerprint = ?').get(values.duplicate_fingerprint)?.id : null;
          existing ??= values.move_fingerprint ? db.prepare('select id from games where move_fingerprint = ?').get(values.move_fingerprint)?.id : null;
          if (existing && claimedGames.has(existing)) throw new Error(`Web game ${game.id} conflicts with a different local game; existing data has been preserved.`);
          if (!existing) {
            existing = insert('games', values);
            summary.gamesAdded++;
            const group = importGroups.get(values.source_id) ?? [];
            group.push({ id: existing, pgn: values.original_pgn, tags: tagsFromPgn(values.original_pgn), unresolved: Number(values.white_player_id === null) + Number(values.black_player_id === null) });
            importGroups.set(values.source_id, group);
          }
        }
        maps.games[game.id] = existing;
        claimedGames.add(existing);
      }
      for (const [sourceId, group] of importGroups) {
        const importId = insert('imports', { source_id: sourceId, filename: `desktop-sync-${tournament.nickname}.pgn`, parsed_count: group.length, parse_error_count: 0, imported_count: group.length, status: 'completed', unresolved_side_count: group.reduce((sum, game) => sum + game.unresolved, 0) });
        for (const [index, game] of group.entries()) insert('import_game_items', { import_id: importId, game_id: game.id, source_index: index + 1, original_pgn: game.pgn, raw_tags: JSON.stringify(game.tags), outcome: 'imported' });
      }
      db.prepare('insert into app_metadata (key, value) values (?, ?) on conflict(key) do update set value=excluded.value').run(provenanceKey, JSON.stringify(maps));
      insert('sync_runs', { tournament_id: localTournament, kind: 'full', status: 'completed', summary_json: JSON.stringify(summary), started_at: startedAt, completed_at: new Date().toISOString() });
      if (db.prepare('pragma foreign_key_check').all().length) throw new Error('Local foreign-key verification failed');
      const importedGameIds = [...new Set(manifest.map(game => maps.games[game.id]))];
      const playable = db.prepare(`select count(*) n from games where id in (${importedGameIds.map(() => '?')}) and json_valid(structured_moves)`).get(...importedGameIds).n;
      if (playable !== importedGameIds.length) throw new Error('Some synchronized games have no playable move data');
      summary.localTournamentId = localTournament;
      summary.localTournamentGames = db.prepare('select count(*) n from games g where exists(select 1 from tournament_participants tp where tp.tournament_id=? and tp.player_id in (g.white_player_id,g.black_player_id))').get(localTournament).n;
      summary.completedAt = new Date().toISOString();
      db.exec('commit');
      writeFileSync(path.join(cache, 'last-sync.json'), JSON.stringify(summary, null, 2));
      console.log(JSON.stringify(summary, null, 2));
      return summary;
    } catch (error) {
      db.exec('rollback');
      throw error;
    }
  } finally {
    client.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncDesktop(optionsFrom(process.argv.slice(2))).catch(error => {
    console.error(`Desktop synchronization failed: ${error.message}`);
    process.exitCode = 1;
  });
}
