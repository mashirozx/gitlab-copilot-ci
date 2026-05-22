import type { MergeRequestDiffSchema } from "@gitbeaker/rest";

export type TrackedDiscussionEntity = {
  id: string;
  file: string;
  line: number;
};

export type MergeRequestSummaryNoteEntity = {
  body: string;
  id: number;
};

export type MergeRequestDiscussionEntity = {
  id: string;
  resolved?: boolean;
  outdated?: boolean;
  notes?: {
    id: number;
    body?: string;
    system?: boolean;
  }[];
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
};

export type ReviewTrackingEntity = {
  discussions?: TrackedDiscussionEntity[];
};

export type CleanupPreviousDiscussionsDataType = {
  processedDiscussions: TrackedDiscussionEntity[];
  remainingDiscussions: TrackedDiscussionEntity[];
  errors: string[];
};
