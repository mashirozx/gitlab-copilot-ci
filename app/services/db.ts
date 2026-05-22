import { Database } from "bun:sqlite";
import { Temporal } from "temporal-polyfill";
import { migrations } from "../migrations/index";
import { argv } from "../utils/argv";
import { getReviewPreferredLine } from "../utils/review-helpers";
import type { StoredReviewEntity } from "./db.types";
import { logger } from "./logger";
import type { ReviewItemEntity } from "./review.types";
import createSchemaMigrationsSql from "./sql/create_schema_migrations.sql" with {
  type: "text",
};
import insertSchemaMigrationSql from "./sql/insert_schema_migration.sql" with {
  type: "text",
};
import selectReviewsForMrSql from "./sql/select_reviews_for_mr.sql" with {
  type: "text",
};
import selectSchemaMigrationByNameSql from "./sql/select_schema_migration_by_name.sql" with {
  type: "text",
};
import setJournalModeWalSql from "./sql/set_journal_mode_wal.sql" with {
  type: "text",
};
import upsertReviewSql from "./sql/upsert_review.sql" with { type: "text" };

export class DatabaseService {
  private database: Database | null = null;
  private readonly dbPath = argv["db"];

  private runMigrations = ({ database }: { database: Database }): void => {
    database.run(createSchemaMigrationsSql);

    for (const migration of migrations) {
      const existing = database
        .query<{ name: string }, [string]>(selectSchemaMigrationByNameSql)
        .get(migration.name);

      if (existing) continue;

      for (const statement of migration.sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)) {
        database.run(statement);
      }

      database
        .query(insertSchemaMigrationSql)
        .run(migration.name, Temporal.Now.instant().epochMilliseconds);
    }
  };

  private initializeDatabase = ({ dbPath }: { dbPath: string }): Database => {
    const database = new Database(dbPath);
    database.run(setJournalModeWalSql);
    this.runMigrations({ database });
    return database;
  };

  initialize = ({ errors }: { errors: string[] }): void => {
    if (!this.dbPath || this.database) {
      return;
    }

    try {
      this.database = this.initializeDatabase({
        dbPath: this.dbPath,
      });
      logger.info(`[Database] Initialized SQLite at ${this.dbPath}`);
    } catch (e) {
      const msg = `[Database] Failed to initialize database: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(msg);
      logger.error(e);
      errors.push(msg);
      this.database = null;
    }
  };

  isEnabled = (): boolean => this.database !== null;

  getStoredReviewsForMR = ({
    mrIid,
  }: {
    mrIid: string;
  }): StoredReviewEntity[] => {
    if (!this.database) {
      return [];
    }

    return this.database
      .query<StoredReviewEntity, [string]>(selectReviewsForMrSql)
      .all(mrIid);
  };

  storeReview = ({
    mrIid,
    review,
    sourceSnippet,
  }: {
    mrIid: string;
    review: ReviewItemEntity;
    sourceSnippet: string;
  }): void => {
    if (!this.database) {
      return;
    }

    const line = getReviewPreferredLine({ review });
    if (review.new_line === undefined || line === null) {
      logger.warn(
        `[Database] Skipping review persistence for ${review.file_path} because database storage currently requires new_line`,
      );
      return;
    }

    const id = `${mrIid}-${review.file_path}-${line}-${Temporal.Now.instant().epochMilliseconds}`;
    this.database
      .query(upsertReviewSql)
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

  close = ({ errors }: { errors: string[] }): void => {
    if (!this.database) {
      return;
    }

    try {
      this.database.close();
    } catch (e) {
      const msg = `[Database] Error closing database: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(msg);
      logger.error(e);
      errors.push(msg);
    } finally {
      this.database = null;
    }
  };
}

export const databaseService = new DatabaseService();
