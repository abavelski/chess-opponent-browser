const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

// Tokenize rather than rewriting parameter values or SQL string literals.
function tokens(sql) {
  return sql.match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\$\d+|::|->>|->|<>|<=|>=|[A-Za-z_][\w$]*|\d+(?:\.\d+)?|[^\s]/g)
    .filter(token => !token.startsWith('--') && !token.startsWith('/*'));
}

function closing(parts, start) {
  let depth = 0;
  for (let i = start; i < parts.length; i++) {
    if (parts[i] === '(') depth++;
    if (parts[i] === ')' && --depth === 0) return i;
  }
  throw new Error('Unbalanced desktop SQL');
}

function split(parts) {
  const groups = [[]];
  let depth = 0;
  for (const part of parts) {
    if (part === '(') depth++;
    if (part === ')') depth--;
    if (part === ',' && depth === 0) groups.push([]);
    else groups.at(-1).push(part);
  }
  return groups;
}

const identifier = name => `"${name.replaceAll('"', '')}"`;
const unquote = name => name.replaceAll('"', '');
const bindValue = value => value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? Number(value) : value ?? null;

function translate(sql) {
  const literals = [];
  const parts = tokens(sql);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].toLowerCase() !== 'ilike') continue;
    let start = i - 1;
    if (parts[start] === ')') {
      let depth = 1;
      while (start > 0 && depth) {
        start--;
        if (parts[start] === ')') depth++;
        if (parts[start] === '(') depth--;
      }
      if (/^[a-z_]\w*$/i.test(parts[start - 1] ?? '')) start--;
    } else {
      while (parts[start - 1] === '.') start -= 2;
    }
    const replacement = ['lower', '(', ...parts.slice(start, i), ')', 'like', 'lower', '(', parts[i + 1], ')'];
    parts.splice(start, i + 2 - start, ...replacement);
    i = start + replacement.length - 1;
  }
  let value = parts.map(token => {
    if (!token.startsWith("'")) return token;
    literals.push(token);
    return `__literal_${literals.length - 1}__`;
  }).join(' ');
  value = value
    .replace(/\s*::\s*(text|integer|int|jsonb|boolean|date|timestamptz)\b/gi, '')
    .replace(/\bnow \( \) - interval (__literal_\d+__)/gi, (_, literal) => {
      const interval = literals[Number(/\d+/.exec(literal)[0])];
      if (!/^'\d+ days'$/.test(interval)) throw new Error('Unsupported desktop interval');
      return `strftime ( '%Y-%m-%dT%H:%M:%fZ' , 'now' , '-${interval.slice(1, -1)}' )`;
    })
    .replace(/\bnow \( \)/gi, "strftime ( '%Y-%m-%dT%H:%M:%fZ' , 'now' )")
    .replace(/((?:"[^"]+"|\w+)(?: \. (?:"[^"]+"|\w+))?) ~ (__literal_\d+__)/g, 'regexp ( $2 , $1 )')
    .replace(/\( array_agg \( (\w+) order by ([^)]+) \) \) \[ 1 \]/gi, '( json_group_array ( $1 order by $2 ) ->> 0 )')
    .replace(/left join lateral \( ([\s\S]*?) limit 1 \) latest on true/gi, (_, subquery) => {
      const federation = /coalesce \( ([\s\S]*?) \) as federation/i.exec(subquery)?.[0].replace(/ as federation$/i, '');
      if (!federation) throw new Error('Unsupported desktop lateral query');
      // Every current lateral query selects the latest import item for one game.
      return `left join "import_game_items" latest_item on latest_item."id" =
        (select li."id" from "import_game_items" li where li."game_id" = g."id"
          order by li."created_at" desc, li."id" desc limit 1)
        left join "imports" latest_import on latest_import."id" = latest_item."import_id"
        /* federation: ${federation.replaceAll('igi .', 'latest_item .')} */`;
    });
  // Resolve the federation projection separately in each UNION branch.
  value = value.split(/(\bunion all\b)/i).map(branch => {
    const federation = /\/\* federation: ([\s\S]*?) \*\//.exec(branch)?.[1];
    return branch.replace(/latest \. "?import_id"?/g, 'latest_item . "import_id"')
      .replace(/latest \. "?filename"?/g, 'latest_import . "filename"')
      .replace(/latest \. "?federation"?/g, `${federation ?? 'null'} as federation`);
  }).join(' ');
  value = value.replace(/\bupdate ("[^"]+"|\w+) (g|p) set\b/gi, 'update $1 as $2 set');
  // SQLite RETURNING does not expose UPDATE aliases.
  value = value.replace(/\breturning ([\s\S]*)$/i, (_, projection) => `returning ${projection.replace(/\b(?:g|p) \./g, '')}`);
  return value.replace(/__literal_(\d+)__/g, (_, index) => literals[Number(index)]);
}

function createSqliteClient(filename, schemaStatements) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('pragma foreign_keys = on; pragma journal_mode = WAL; pragma busy_timeout = 5000;');
  db.function('btrim', value => value == null ? null : String(value).trim());
  db.function('char_length', value => value == null ? null : [...String(value)].length);
  db.function('lower', value => value == null ? null : String(value).toLowerCase());
  db.function('regexp', (pattern, value) => value == null ? null : Number(new RegExp(pattern).test(String(value))));
  db.function('regexp_replace', (value, pattern, replacement, flags) => value == null ? null : String(value).replace(new RegExp(pattern.replaceAll('[[:space:]]', '\\s'), flags), replacement));

  const schemaHash = createHash('sha256').update(JSON.stringify(schemaStatements)).digest('hex');
  db.exec('create table if not exists desktop_schema (version integer primary key, hash text not null)');
  const installed = db.prepare('select version, hash from desktop_schema').get();
  if (installed && (installed.version !== 1 || installed.hash !== schemaHash)) {
    db.close();
    throw new Error('The desktop database schema has changed. A desktop migration is required; your data has been preserved.');
  }
  if (!installed) {
    db.exec('begin immediate');
    try {
      for (const statement of schemaStatements) db.exec(translate(statement));
      db.prepare('insert into desktop_schema values (1, ?)').run(schemaHash);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      db.close();
      throw error;
    }
  }

  let sequence = 0;
  function atomic(work) {
    const savepoint = `desktop_${sequence++}`;
    db.exec(`savepoint ${savepoint}`);
    try {
      const result = work();
      db.exec(`release ${savepoint}`);
      return result;
    } catch (error) {
      db.exec(`rollback to ${savepoint}; release ${savepoint}`);
      if (/UNIQUE constraint failed: games\.duplicate_fingerprint/.test(error.message)) {
        error.code = '23505';
        error.constraint = 'games_duplicate_fingerprint_unique';
      }
      throw error;
    }
  }

  function prepareDefaults(parts) {
    if (parts[0]?.toLowerCase() !== 'insert') return parts;
    const tableIndex = parts.findIndex(part => part.toLowerCase() === 'into') + 1;
    const columnsStart = tableIndex + 1;
    if (parts[columnsStart] !== '(') return parts;
    const columnsEnd = closing(parts, columnsStart);
    const columns = split(parts.slice(columnsStart + 1, columnsEnd)).map(parts => unquote(parts[0]));
    const defaults = new Map(db.prepare(`pragma table_info(${identifier(parts[tableIndex])})`).all().map(c => [c.name, c.dflt_value ?? 'null']));
    const values = parts.findIndex((part, index) => index > columnsEnd && part.toLowerCase() === 'values');
    if (values === -1) return parts;
    let i = values + 1;
    while (parts[i] === '(') {
      const end = closing(parts, i);
      const groups = split(parts.slice(i + 1, end));
      const replacements = groups.flatMap((group, index) => [index ? ',' : '', ...group.map(token => token.toLowerCase() === 'default' ? defaults.get(columns[index]) : token)]).filter(Boolean);
      parts.splice(i + 1, end - i - 1, ...replacements);
      i += replacements.length + 2;
      if (parts[i] !== ',') break;
      i++;
    }
    return parts;
  }

  function statement(sql, params) {
    let parts = prepareDefaults(tokens(sql));
    // PostgreSQL's import upsert uses xmax to distinguish inserts from updates.
    // The SQLite writer lock makes the preflight and upsert one atomic operation.
    if (/\bxmax\b/i.test(sql)) {
      const columnStart = parts.indexOf('(');
      const columnEnd = closing(parts, columnStart);
      const columns = split(parts.slice(columnStart + 1, columnEnd)).map(p => unquote(p[0]));
      const valuesStart = parts.findIndex(p => p.toLowerCase() === 'values') + 1;
      const values = split(parts.slice(valuesStart + 1, closing(parts, valuesStart)));
      const conflictIndex = parts.findIndex(p => p.toLowerCase() === 'conflict');
      const target = unquote(parts[conflictIndex + 2]);
      const expression = values[columns.indexOf(target)].join(' ');
      const existing = statement(`select id from games where ${identifier(target)} = ${expression}`, params).rows.length > 0;
      parts = tokens(parts.join(' ').replace(/\( xmax = 0 \)/i, existing ? '0' : '1'));
    }
    const parameters = [];
    const bound = tokens(translate(parts.join(' '))).map(part => {
      if (!/^\$\d+$/.test(part)) return part;
      parameters.push(bindValue(params[Number(part.slice(1)) - 1]));
      return '?';
    }).join(' ');
    const prepared = db.prepare(bound);
    const columns = prepared.columns().map(c => c.name);
    prepared.setReturnArrays(true);
    const rows = columns.length ? prepared.all(...parameters) : (prepared.run(...parameters), []);
    return { columns, rows };
  }

  function execute(sql, params, options = {}) {
    return atomic(() => {
      const parts = tokens(sql);
      const temporary = [];
      try {
        let remaining = parts;
        if (parts[0]?.toLowerCase() === 'with') {
          let start = 1;
          // Materialize CTEs in order. This also supports PostgreSQL's writable
          // CTEs, which SQLite cannot express as one native SQL statement.
          do {
            const name = parts[start];
            if (parts[start + 1]?.toLowerCase() !== 'as' || parts[start + 2] !== '(') throw new Error('Unsupported desktop CTE');
            const end = closing(parts, start + 2);
            const result = statement(parts.slice(start + 3, end).join(' '), params);
            if (!result.columns.length) throw new Error('Desktop CTE must return columns');
            db.exec(`create temp table ${identifier(name)} (${result.columns.map(identifier).join(', ')})`);
            temporary.push(name);
            if (result.rows.length) {
              const insert = db.prepare(`insert into ${identifier(name)} values (${result.columns.map(() => '?').join(', ')})`);
              for (const row of result.rows) insert.run(...row);
            }
            start = end + 1;
            if (parts[start] !== ',') break;
            start++;
          } while (start < parts.length);
          remaining = parts.slice(start);
        }
        const result = statement(remaining.join(' '), params);
        const rows = result.rows.map(row => row.map((value, index) => ['is_active', 'is_fixture', 'inserted'].includes(result.columns[index]) && value !== null ? Boolean(value) : value));
        return { rows: options.arrayMode ? rows : rows.map(row => Object.fromEntries(result.columns.map((name, index) => [name, row[index]]))) };
      } finally {
        for (const name of temporary.reverse()) db.exec(`drop table ${identifier(name)}`);
      }
    });
  }

  // Neon requests are lazy thenables: batch() constructs them before opening
  // a transaction. Preserve that property so batch writes really are atomic.
  const query = (sql, params = [], options = {}) => {
    const run = () => execute(sql, params, options);
    return { run, then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject) };
  };
  return {
    connection: db,
    query,
    transaction: requests => Promise.resolve().then(() => atomic(() => requests.map(request => request.run()))),
    close: () => db.close(),
  };
}

module.exports = { createSqliteClient, translate };
