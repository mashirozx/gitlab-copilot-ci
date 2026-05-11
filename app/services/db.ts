import { Database } from "bun:sqlite";
import { Temporal } from "temporal-polyfill";
import { migrations } from "../migrations/index";
import type { ReviewItem, StoredReview } from "../types/entities";

const runMigrations = (database: Database): void => {
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  for (const migration of migrations) {
    const existing = database
      .query<{ name: string }, [string]>(
        "SELECT name FROM schema_migrations WHERE name = ?",
      )
      .get(migration.name);

    if (existing) continue;

    for (const statement of migration.sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)) {
      database.run(statement);
    }

    database
      .query("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
      .run(migration.name, Temporal.Now.instant().epochMilliseconds);
  }
};

export const initializeDatabase = (dbPath: string): Database => {
  const database = new Database(dbPath);
  database.run("PRAGMA journal_mode = WAL");
  runMigrations(database);
  return database;
};

export const getStoredReviewsForMR = ({
  database,
  mrIid,
}: {
  database: Database;
  mrIid: string;
}): StoredReview[] => {
  return database
    .query<StoredReview, [string]>(
      "SELECT id, file_path, new_line, suggestion, source_snippet, mr_iid, created_at FROM reviews WHERE mr_iid = ? ORDER BY created_at DESC",
    )
    .all(mrIid);
};

export const storeReview = ({
  database,
  mrIid,
  review,
  sourceSnippet,
}: {
  database: Database;
  mrIid: string;
  review: ReviewItem;
  sourceSnippet: string;
}): void => {
  const id = `${mrIid}-${review.file_path}-${review.new_line}-${Temporal.Now.instant().epochMilliseconds}`;
  database
    .query(
      "INSERT OR REPLACE INTO reviews (id, file_path, new_line, suggestion, source_snippet, mr_iid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      review.file_path,
      review.new_line,
      review.suggestion,
      sourceSnippet,
      mrIid,
      Temporal.Now.instant().epochMilliseconds,
    );
};
