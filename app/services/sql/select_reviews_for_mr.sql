SELECT id, file_path, new_line, suggestion, source_snippet, mr_iid, created_at
FROM reviews
WHERE mr_iid = ?
ORDER BY created_at DESC
