CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  new_line INTEGER NOT NULL,
  suggestion TEXT NOT NULL,
  source_snippet TEXT,
  mr_iid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
