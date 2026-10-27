// Database.ts — terbebas dari import electron agar bisa diuji via vitest.
import Database from 'better-sqlite3';
import { MIGRATIONS, SCHEMA_SQL, USER_VERSION } from './schema';
import { seedDefaultSettings, seedDefaultCategories } from './repositories/settings';

export type DB = Database.Database;

export function applyPragmas(db: DB): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}

export function applySchema(db: DB): void {
  applyPragmas(db);
  db.exec(SCHEMA_SQL);
  const ver = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  if (ver < USER_VERSION) {
    // Jalankan langkah migrasi ver -> ver+1 -> ... -> USER_VERSION secara berurutan.
    const runStep = db.transaction(() => {
      for (let v = ver; v < USER_VERSION; v++) {
        for (const sql of MIGRATIONS[v] ?? []) db.exec(sql);
      }
      db.pragma(`user_version = ${USER_VERSION}`);
    });
    runStep();
  }
  seedDefaultCategories(db);
  seedDefaultSettings(db);
}

/** Buka DB dari file path (dipakai main process). */
export function openDatabaseAt(file: string): DB {
  const db = new Database(file);
  applySchema(db);
  return db;
}
