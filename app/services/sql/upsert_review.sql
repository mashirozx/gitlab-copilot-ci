INSERT OR REPLACE INTO reviews (
  id,
  file_path,
  new_line,
  suggestion,
  source_snippet,
  mr_iid,
  created_at
) VALUES (?, ?, ?, ?, ?, ?, ?)
