import { Gitlab } from "@gitbeaker/rest";
import type {
  MergeRequestDiscussion,
  MergeRequestPositionContext,
  MergeRequestSummaryNote,
  ReviewItem,
  TrackedDiscussion,
} from "../types/entities";
import { argv } from "../utils/argv";
import { logger } from "./logger";

export class GitLabService {
  private readonly client: Gitlab;
  private readonly projectId = argv["project-id"];
  private readonly mrIid = parseInt(argv["mr-iid"], 10);
  private readonly langs = argv["lang"];
  private readonly reviewMarker = argv["review-marker"];
  private readonly summaryMarker = argv["summary-marker"];
  private readonly reviewDataTag = argv["review-data-tag"];

  constructor() {
    this.client = new Gitlab({
      host: argv["gitlab-url"],
      token: argv["gitlab-token"],
    });
  }

  getMergeRequest = async () =>
    this.client.MergeRequests.show(this.projectId, this.mrIid);

  getMergeRequestDiffs = async () =>
    this.client.MergeRequests.allDiffs(this.projectId, this.mrIid);

  getExistingSummaryNote = async (): Promise<
    MergeRequestSummaryNote | undefined
  > => {
    const mrNotes = (await this.client.MergeRequestNotes.all(
      this.projectId,
      this.mrIid,
    )) as MergeRequestSummaryNote[];

    return mrNotes.find((note) =>
      note.body.includes(`<!-- ${this.summaryMarker} -->`),
    );
  };

  getTrackedDiscussionsFromSummary = ({
    noteBody,
  }: {
    noteBody: string;
  }): TrackedDiscussion[] => {
    const dataMatch = noteBody.match(
      new RegExp(`<!-- ${this.reviewDataTag}:(.*?) -->`),
    );

    if (!dataMatch) {
      return [];
    }

    try {
      const parsed = JSON.parse(dataMatch[1] ?? "null") as {
        discussions?: TrackedDiscussion[];
      };

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
    trackedDiscussions: TrackedDiscussion[];
  }): Promise<{
    processedDiscussions: TrackedDiscussion[];
    remainingDiscussions: TrackedDiscussion[];
    errors: string[];
  }> => {
    const discussions = (await this.client.MergeRequestDiscussions.all(
      this.projectId,
      this.mrIid,
    )) as MergeRequestDiscussion[];

    const processedDiscussions: TrackedDiscussion[] = [];
    const remainingDiscussions: TrackedDiscussion[] = [];
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
    review: ReviewItem;
    mergeRequest: MergeRequestPositionContext;
  }): Promise<TrackedDiscussion> => {
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
      newLine: String(review.new_line),
    };

    const position = review.old_line
      ? { ...positionBase, oldLine: String(review.old_line) }
      : positionBase;

    const discussion = await this.client.MergeRequestDiscussions.create(
      this.projectId,
      this.mrIid,
      commentBody,
      { position },
    );

    return {
      id: discussion.id,
      file: review.file_path,
      line: review.new_line,
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
