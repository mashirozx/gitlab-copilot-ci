import type { MergeRequestDiffSchema } from "@gitbeaker/rest";

export type ReviewHistoryContentEntity = {
  suggestion: string;
  file_path: string;
  old_line: number | null;
  new_line: number | null;
};

export type ReviewHistoryDiscussionEntity = {
  discussion_id: string;
  note_id: string;
  content: ReviewHistoryContentEntity;
};

export type ReviewHistoryRunEntity = {
  discussions: ReviewHistoryDiscussionEntity[];
};

export type MergeRequestPositionContextEntity = {
  diff_refs: {
    base_sha: string;
    head_sha: string;
  };
};

export type MergeRequestDiffPageDataType = {
  page: number;
  diffs: MergeRequestDiffSchema[];
};

export type MergeRequestDiffsResultDataType = {
  changes: MergeRequestDiffSchema[];
  pages: MergeRequestDiffPageDataType[];
  errors: string[];
  withCriticalError?: boolean;
};
