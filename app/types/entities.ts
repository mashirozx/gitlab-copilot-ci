export type ReviewItem = {
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;
  translations?: Record<string, string>;
};

export type StoredReview = {
  id: string;
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;
  source_snippet: string;
  mr_iid: string;
  created_at: number;
};

export type ReviewResponse = {
  comment: string;
  reviews: ReviewItem[];
  errors?: string[];
  context?: {
    total_length?: number;
    used_length?: number;
    usage_percentage?: number;
  };
  duration?: number;
  model?: string;
};
