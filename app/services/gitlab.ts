import { Gitlab } from "@gitbeaker/rest";
import type { ReviewItemEntity } from "../types/review.types";
import { argv } from "../utils/argv";
import { getReviewPreferredLine } from "../utils/review-helpers";
import type {
  CleanupPreviousDiscussionsDataType,
  MergeRequestDiffPageDataType,
  MergeRequestDiffsResultDataType,
  MergeRequestDiscussionEntity,
  MergeRequestPositionContextEntity,
  MergeRequestSummaryNoteEntity,
  ReviewTrackingEntity,
  TrackedDiscussionEntity,
} from "./gitlab.types";
import { logger } from "./logger";

export class GitLabService {
  private readonly diffPageSize = 20;
  private readonly maxGitDiffPage =
    argv["max-git-diff-page"] ?? Number.POSITIVE_INFINITY;
  private readonly client: Gitlab;
  private readonly projectId = argv["project-id"];
  private readonly mrIid = parseInt(argv["mr-iid"], 10);
  private readonly langs = argv["lang"];
  private readonly htmlMarkerPrefix = argv["html-marker-prefix"];
  private readonly reviewMarker = `${this.htmlMarkerPrefix}-review-marker`;
  private readonly summaryMarker = `${this.htmlMarkerPrefix}-summary-marker`;
  private readonly reviewDataTag = `${this.htmlMarkerPrefix}-review-data`;

  constructor() {
    this.client = new Gitlab({
      host: argv["gitlab-url"],
      token: argv["gitlab-token"],
    });
  }

  getMergeRequest = async () =>
    this.client.MergeRequests.show(this.projectId, this.mrIid);

  getMergeRequestDiffs = async (): Promise<MergeRequestDiffsResultDataType> => {
    const pages: MergeRequestDiffPageDataType[] = [];
    const errors: string[] = [];

    // GitLab paginates merge request diffs by page/per_page. With perPage fixed
    // at 20 here, a max page limit of N means at most N * 20 diff entries are
    // handed to the LLM.
    for (let page = 1; page <= this.maxGitDiffPage; page += 1) {
      const diffs = await this.client.MergeRequests.allDiffs(
        this.projectId,
        this.mrIid,
        {
          page,
          perPage: this.diffPageSize,
        },
      );

      if (diffs.length === 0) {
        break;
      }

      pages.push({ page, diffs });

      if (diffs.length < this.diffPageSize) {
        break;
      }

      if (page === this.maxGitDiffPage) {
        const message = `[GitLab] Reached --max-git-diff-page=${this.maxGitDiffPage}. Later diff pages were skipped. With per_page=${this.diffPageSize}, only the first ${this.maxGitDiffPage * this.diffPageSize} diff entries were eligible for review input.`;
        logger.warn(message);
        errors.push(message);
      }
    }

    if (pages.length === 0) {
      pages.push({ page: 1, diffs: [] });
    }

    return {
      changes: pages.flatMap((page) => page.diffs),
      pages,
      errors,
    };
  };

  getExistingSummaryNote = async (): Promise<
    MergeRequestSummaryNoteEntity | undefined
  > => {
    const mrNotes = (await this.client.MergeRequestNotes.all(
      this.projectId,
      this.mrIid,
    )) as MergeRequestSummaryNoteEntity[];

    return mrNotes.find((note) =>
      note.body.includes(`<!-- ${this.summaryMarker} -->`),
    );
  };

  getTrackedDiscussionsFromSummary = ({
    noteBody,
  }: {
    noteBody: string;
  }): TrackedDiscussionEntity[] => {
    const dataMatch = noteBody.match(
      new RegExp(`<!-- ${this.reviewDataTag}:(.*?) -->`),
    );

    if (!dataMatch) {
      return [];
    }

    try {
      const parsed = JSON.parse(dataMatch[1] ?? "null") as ReviewTrackingEntity;

      return parsed.discussions ?? [];
    } catch {
      logger.warn(
        "Failed to parse previous discussion data from summary comment",
      );
      return [];
    }
  };

  deleteSummaryNote = async ({ noteId }: { noteId: number }) =>
    this.client.MergeRequestNotes.remove(this.projectId, this.mrIid, noteId);

  cleanupPreviousDiscussions = async ({
    trackedDiscussions,
  }: {
    trackedDiscussions: TrackedDiscussionEntity[];
  }): Promise<CleanupPreviousDiscussionsDataType> => {
    const discussions = (await this.client.MergeRequestDiscussions.all(
      this.projectId,
      this.mrIid,
    )) as MergeRequestDiscussionEntity[];

    const processedDiscussions: TrackedDiscussionEntity[] = [];
    const remainingDiscussions: TrackedDiscussionEntity[] = [];
    const errors: string[] = [];

    for (const tracked of trackedDiscussions) {
      try {
        const discussion = discussions.find((item) => item.id === tracked.id);

        if (!discussion || discussion.resolved) {
          continue;
        }

        const notes = (discussion.notes ?? []).filter((note) => !note.system);

        if (!notes[0]?.body?.includes(`<!-- ${this.reviewMarker} -->`)) {
          continue;
        }

        const hasOtherReplies = notes.some(
          (note) => !note.body?.includes(`<!-- ${this.reviewMarker} -->`),
        );

        if (hasOtherReplies || discussion.outdated) {
          await this.client.MergeRequestDiscussions.resolve(
            this.projectId,
            this.mrIid,
            tracked.id,
            true,
          );
          processedDiscussions.push(tracked);
          continue;
        }

        for (const note of notes) {
          await this.client.MergeRequestDiscussions.removeNote(
            this.projectId,
            this.mrIid,
            tracked.id,
            note.id,
          );
        }

        processedDiscussions.push(tracked);
      } catch (error) {
        const message = `Failed to clean up discussion ${tracked.id} (${tracked.file}:${tracked.line}): ${error instanceof Error ? error.message : String(error)}`;
        logger.error(message);
        errors.push(message);
        remainingDiscussions.push(tracked);
      }
    }

    return {
      processedDiscussions,
      remainingDiscussions,
      errors,
    };
  };

  createReviewDiscussion = async ({
    review,
    mergeRequest,
  }: {
    review: ReviewItemEntity;
    mergeRequest: MergeRequestPositionContextEntity;
  }): Promise<TrackedDiscussionEntity> => {
    if (review.new_line === undefined && review.old_line === undefined) {
      throw new Error(
        "Review must include at least one of new_line or old_line",
      );
    }

    const marker = `<!-- ${this.reviewMarker} -->`;
    const translationLines = this.langs
      .map((lang) => review.translations?.[lang])
      .filter((translation): translation is string => !!translation)
      .map((translation) => `\n\n${translation}`)
      .join("");
    const commentBody = `${marker}\n\n${review.suggestion}${translationLines}`;

    /**
     * IMPORTANT: Position object for GitLab MR discussions.
     *
     * Critical details that caused "line_code can't be blank" errors:
     * 1. startSha MUST equal baseSha (not diff_refs.start_sha).
     *    The start_sha in diff_refs is for a different comparison context
     *    and causes invalid line_code computation.
     * 2. oldLine MUST be omitted for newly added lines.
     *    Only include oldLine when the line actually exists in the old version.
     *    Omitting it allows GitLab API to properly compute the internal line_code.
     *
     * Reference: https://stackoverflow.com/a/65944171/8083009
     */
    const positionBase = {
      baseSha: mergeRequest.diff_refs.base_sha,
      headSha: mergeRequest.diff_refs.head_sha,
      startSha: mergeRequest.diff_refs.base_sha,
      positionType: "text" as const,
      newPath: review.file_path,
      oldPath: review.file_path,
    };

    const position = {
      ...positionBase,
      ...(review.new_line !== undefined
        ? { newLine: String(review.new_line) }
        : {}),
      ...(review.old_line !== undefined
        ? { oldLine: String(review.old_line) }
        : {}),
    };

    const discussion = await this.client.MergeRequestDiscussions.create(
      this.projectId,
      this.mrIid,
      commentBody,
      { position },
    );

    return {
      id: discussion.id,
      file: review.file_path,
      line: getReviewPreferredLine({ review }) ?? 0,
    };
  };

  createSummaryNote = async ({ summaryBody }: { summaryBody: string }) =>
    this.client.MergeRequestNotes.create(
      this.projectId,
      this.mrIid,
      summaryBody,
    );
}

export const gitlabService = new GitLabService();
