export type ReviewItem = {
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;
  translations?: Record<string, string>;
};

export type TrackedDiscussion = {
  id: string;
  file: string;
  line: number;
};

export type MergeRequestSummaryNote = {
  body: string;
  id: number;
};

export type MergeRequestDiscussion = {
  id: string;
  resolved?: boolean;
  outdated?: boolean;
  notes?: {
    id: number;
    body?: string;
    system?: boolean;
  }[];
};

export type MergeRequestPositionContext = {
  diff_refs: {
    base_sha: string;
    head_sha: string;
  };
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
