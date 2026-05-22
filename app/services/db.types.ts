export type StoredReviewEntity = {
  id: string;
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;
  source_snippet: string;
  mr_iid: string;
  created_at: number;
};
