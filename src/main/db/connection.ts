import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import type { Role } from '@shared/types.js'
import schemaSql from './schema.sql?raw'

const SCHEMA_VERSION = '3'

/** Whether `table` has a column named `col`. */
function hasColumn(db: Database.Database, table: string, col: string): boolean {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[]
  return rows.some((r) => r.name === col)
}

/**
 * Bring a pre-v3 file up to the current schema. `CREATE TABLE IF NOT EXISTS`
 * (run just before this) can neither add columns nor widen a CHECK on tables
 * that already exist, so:
 *   - plot.block is added with a plain additive ALTER (default 0 = rep, i.e. a
 *     complete block), which is FK-safe.
 *   - protocol is rebuilt (SQLite can't ALTER a CHECK) to gain block_size and to
 *     widen design's CHECK to include 'ALPHA'. The row is a singleton, so this
 *     is cheap. Gated on block_size being absent, so it runs at most once.
 */
function migrate(db: Database.Database): void {
  if (!hasColumn(db, 'plot', 'block')) {
    db.exec(`ALTER TABLE plot ADD COLUMN block INTEGER NOT NULL DEFAULT 0`)
  }

  if (!hasColumn(db, 'protocol', 'block_size')) {
    // Rebuild recipe: FKs off (protocol is referenced by trial), swap in a transaction, FKs on.
    db.pragma('foreign_keys = OFF')
    db.transaction(() => {
      db.exec(`
        CREATE TABLE protocol_new (
          id               INTEGER PRIMARY KEY CHECK (id = 1),
          protocol_uid     TEXT NOT NULL DEFAULT '',
          protocol_version INTEGER NOT NULL DEFAULT 1,
          title            TEXT NOT NULL DEFAULT '',
          crop             TEXT NOT NULL DEFAULT '',
          target_pest      TEXT NOT NULL DEFAULT '',
          objective        TEXT NOT NULL DEFAULT '',
          investigator     TEXT NOT NULL DEFAULT '',
          season           TEXT NOT NULL DEFAULT '',
          notes            TEXT NOT NULL DEFAULT '',
          design           TEXT NOT NULL DEFAULT 'RCB' CHECK (design IN ('RCB', 'CRD', 'ALPHA')),
          replicates       INTEGER NOT NULL DEFAULT 4,
          block_size       INTEGER NOT NULL DEFAULT 2,
          plot_width       REAL NOT NULL DEFAULT 0,
          plot_length      REAL NOT NULL DEFAULT 0
        );
        INSERT INTO protocol_new
          (id, protocol_uid, protocol_version, title, crop, target_pest, objective,
           investigator, season, notes, design, replicates, plot_width, plot_length)
          SELECT id, protocol_uid, protocol_version, title, crop, target_pest, objective,
                 investigator, season, notes, design, replicates, plot_width, plot_length
          FROM protocol;
        DROP TABLE protocol;
        ALTER TABLE protocol_new RENAME TO protocol;
      `)
    })()
    db.pragma('foreign_keys = ON')
  }

  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(SCHEMA_VERSION)
}

/**
 * Opens (or creates) an Open ARM SQLite file and ensures the schema is applied.
 * A file is either a protocol (authored template) or a trial (local instance);
 * meta.role records which. A single Database handle is held per process; opening
 * a new file closes the previous one.
 */
let current: Database.Database | null = null
let currentPath: string | null = null
let currentRole: Role = 'protocol'

export interface OpenOptions {
  /** Role to stamp on a freshly created file. Ignored when opening an existing file. */
  role?: Role
  /** When true, a new file is being created (seed the protocol row + meta). */
  create?: boolean
}

export function openProject(filePath: string, opts: OpenOptions = {}): Database.Database {
  closeProject()
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)
  migrate(db)

  // Ensure the singleton protocol row exists (with a stable uid) and meta is seeded.
  db.prepare(
    `INSERT OR IGNORE INTO protocol (id, protocol_uid, protocol_version) VALUES (1, ?, 1)`
  ).run(randomUUID())
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(
    'schema_version',
    SCHEMA_VERSION
  )
  if (opts.create && opts.role) {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('role', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    ).run(opts.role)
  }

  const roleRow = db.prepare(`SELECT value FROM meta WHERE key = 'role'`).get() as
    | { value: string }
    | undefined
  currentRole = roleRow?.value === 'trial' ? 'trial' : 'protocol'

  current = db
  currentPath = filePath
  return db
}

export function getDb(): Database.Database {
  if (!current) throw new Error('No project is open')
  return current
}

export function getCurrentPath(): string | null {
  return currentPath
}

export function getRole(): Role {
  return currentRole
}

export function closeProject(): void {
  if (current) {
    current.close()
    current = null
    currentPath = null
    currentRole = 'protocol'
  }
}
