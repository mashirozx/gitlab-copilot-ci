import type { MergeRequestDiffSchema } from "@gitbeaker/rest";

export type ReviewItem = {
  file_path: string;
  new_line?: number;
  old_line?: number;
  diff_file?: string;
  diff_line_code?: string;
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

export type MergeRequestDiffPage = {
  page: number;
  diffs: MergeRequestDiffSchema[];
};

export type MergeRequestDiffsResult = {
  changes: MergeRequestDiffSchema[];
  pages: MergeRequestDiffPage[];
  errors: string[];
};

export type ReviewTrackingData = {
  discussions?: TrackedDiscussion[];
};

export type CleanupPreviousDiscussionsResult = {
  processedDiscussions: TrackedDiscussion[];
  remainingDiscussions: TrackedDiscussion[];
  errors: string[];
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
