import {
  type DiscussionSchema,
  Gitlab,
  type MergeRequestNoteSchema,
} from "@gitbeaker/rest";
import type { ReviewItemEntity } from "../types/review.types";
import { argv } from "../utils/argv";
import {
  buildReviewDiscussionBody,
  getDisplayLanguages,
  getLocalizedRecordValue,
} from "../utils/composers/review-comment-builder";
import type {
  MergeRequestDiffPageDataType,
  MergeRequestDiffsResultDataType,
  MergeRequestPositionContextEntity,
  ReviewHistoryContentEntity,
  ReviewHistoryDiscussionEntity,
  ReviewHistoryRunEntity,
} from "./gitlab.types";
import { logger } from "./logger";

const requireArg = ({
  name,
  value,
}: {
  name: string;
  value: string | undefined;
}): string => {
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const getBooleanProperty = ({
  value,
  key,
}: {
  value: Record<string, unknown>;
  key: string;
}): boolean | undefined => {
  const property = value[key];

  return typeof property === "boolean" ? property : undefined;
};

const hasNonNullProperty = ({
  value,
  key,
}: {
  value: Record<string, unknown>;
  key: string;
}): boolean => value[key] !== null && value[key] !== undefined;

const getStringProperty = ({
  value,
  key,
}: {
  value: Record<string, unknown>;
  key: string;
}): string | undefined => {
  const property = value[key];

  return typeof property === "string" ? property : undefined;
};

const getObjectProperty = ({
  value,
  key,
}: {
  value: Record<string, unknown>;
  key: string;
}): Record<string, unknown> | undefined => {
  const property = value[key];

  return property && typeof property === "object"
    ? (property as Record<string, unknown>)
    : undefined;
};

const getNumberProperty = ({
  value,
  key,
}: {
  value: Record<string, unknown>;
  key: string;
}): number | undefined => {
  const property = value[key];

  return typeof property === "number" ? property : undefined;
};

const getHeaderValue = ({
  headers,
  name,
}: {
  headers: unknown;
  name: string;
}): string | undefined => {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const matchedHeader = headers.find(
      (entry): entry is [string, string] =>
        Array.isArray(entry) &&
        entry.length >= 2 &&
        typeof entry[0] === "string" &&
        entry[0].toLowerCase() === name.toLowerCase() &&
        typeof entry[1] === "string",
    );

    return matchedHeader?.[1];
  }

  if (headers && typeof headers === "object") {
    const headerRecord = headers as Record<string, unknown>;
    const directHeader = headerRecord[name];

    if (typeof directHeader === "string") {
      return directHeader;
    }

    const matchedKey = Object.keys(headerRecord).find(
      (key) => key.toLowerCase() === name.toLowerCase(),
    );

    return matchedKey && typeof headerRecord[matchedKey] === "string"
      ? (headerRecord[matchedKey] as string)
      : undefined;
  }

  return undefined;
};

const buildGitLabRequestFailureMessage = ({
  error,
}: {
  error: unknown;
}): string | null => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const cause = getObjectProperty({
    value: error as Record<string, unknown>,
    key: "cause",
  });

  if (!cause) {
    return null;
  }

  const response = getObjectProperty({
    value: cause,
    key: "response",
  });
  const request = getObjectProperty({
    value: cause,
    key: "request",
  });
  const requestId = getHeaderValue({
    headers: response?.headers,
    name: "x-request-id",
  });
  const status = response
    ? getNumberProperty({
        value: response,
        key: "status",
      })
    : undefined;
  const method = request
    ? getStringProperty({
        value: request,
        key: "method",
      })
    : undefined;
  const url =
    (request
      ? getStringProperty({
          value: request,
          key: "url",
        })
      : undefined) ??
    (response
      ? getStringProperty({
          value: response,
          key: "url",
        })
      : undefined);

  if (!requestId && status === undefined && !method && !url) {
    return null;
  }

  const parts = ["[GitLab] API request failed"];

  if (status !== undefined) {
    parts.push(`status=${status}`);
  }

  if (method) {
    parts.push(`method=${method}`);
  }

  if (url) {
    parts.push(`url=${url}`);
  }

  if (requestId) {
    parts.push(`x-request-id=${requestId}`);
  }

  return parts.join(" ");
};

const getNullableLineProperty = ({
  value,
  key,
}: {
  value: Record<string, unknown>;
  key: string;
}): number | null => {
  const property = value[key];

  return typeof property === "number" ? property : null;
};

const normalizeDecodedReviewHistory = ({
  value,
}: {
  value: unknown;
}): ReviewHistoryRunEntity[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((run): ReviewHistoryRunEntity[] => {
    if (!run || typeof run !== "object") {
      return [];
    }

    const rawDiscussions = (run as { discussions?: unknown }).discussions;

    if (!Array.isArray(rawDiscussions)) {
      return [];
    }

    const discussions = rawDiscussions.flatMap(
      (discussion): ReviewHistoryDiscussionEntity[] => {
        if (!discussion || typeof discussion !== "object") {
          return [];
        }

        const rawDiscussion = discussion as Record<string, unknown>;
        const rawContent = rawDiscussion.content;

        if (!rawContent || typeof rawContent !== "object") {
          return [];
        }

        const rawHistoryContent = rawContent as Record<string, unknown>;
        const suggestion =
          getStringProperty({
            value: rawHistoryContent,
            key: "suggestion",
          }) ??
          getStringProperty({
            value: rawHistoryContent,
            key: "content",
          });
        const filePath = getStringProperty({
          value: rawHistoryContent,
          key: "file_path",
        });
        const discussionId = getStringProperty({
          value: rawDiscussion,
          key: "discussion_id",
        });
        const noteId = getStringProperty({
          value: rawDiscussion,
          key: "note_id",
        });

        if (!suggestion || !filePath || !discussionId || !noteId) {
          return [];
        }

        const content: ReviewHistoryContentEntity = {
          suggestion,
          file_path: filePath,
          old_line: getNullableLineProperty({
            value: rawHistoryContent,
            key: "old_line",
          }),
          new_line: getNullableLineProperty({
            value: rawHistoryContent,
            key: "new_line",
          }),
        };

        return [
          {
            discussion_id: discussionId,
            note_id: noteId,
            content,
          },
        ];
      },
    );

    return discussions.length > 0 ? [{ discussions }] : [];
  });
};

export const isDiscussionResolved = ({
  discussion,
}: {
  discussion: DiscussionSchema;
}): boolean => {
  const directResolved = getBooleanProperty({
    value: discussion,
    key: "resolved",
  });

  if (directResolved !== undefined) {
    return directResolved;
  }

  const resolvableNotes =
    discussion.notes?.filter((note) => note.resolvable) ?? [];

  if (resolvableNotes.length === 0) {
    return false;
  }

  return resolvableNotes.every((note) => {
    const resolved = getBooleanProperty({
      value: note as Record<string, unknown>,
      key: "resolved",
    });

    if (resolved !== undefined) {
      return resolved;
    }

    return (
      hasNonNullProperty({
        value: note as Record<string, unknown>,
        key: "resolved_at",
      }) ||
      hasNonNullProperty({
        value: note as Record<string, unknown>,
        key: "resolved_by",
      }) ||
      hasNonNullProperty({
        value: note as Record<string, unknown>,
        key: "resolved_by_id",
      }) ||
      getBooleanProperty({
        value: note as Record<string, unknown>,
        key: "resolved_by_push",
      }) === true
    );
  });
};

export const filterExistingUnresolvedReviewHistory = ({
  reviewHistory,
  discussions,
}: {
  reviewHistory: ReviewHistoryRunEntity[];
  discussions: DiscussionSchema[];
}): {
  reviewHistory: ReviewHistoryRunEntity[];
  removedResolvedCount: number;
  removedDeletedCount: number;
  existingUnresolvedCount: number;
} => {
  const discussionStateById = new Map(
    discussions.map((discussion) => [
      discussion.id,
      {
        isResolved: isDiscussionResolved({ discussion }),
        noteIds: new Set(
          discussion.notes
            ?.map((note) => note.id)
            .filter((noteId): noteId is number => typeof noteId === "number") ??
            [],
        ),
      },
    ]),
  );

  let removedResolvedCount = 0;
  let removedDeletedCount = 0;
  let existingUnresolvedCount = 0;

  const filteredReviewHistory = reviewHistory
    .map((run) => ({
      ...run,
      discussions: run.discussions.filter((discussion) => {
        const liveDiscussion = discussionStateById.get(
          discussion.discussion_id,
        );

        if (!liveDiscussion) {
          removedDeletedCount += 1;
          return false;
        }

        if (liveDiscussion.isResolved) {
          removedResolvedCount += 1;
          return false;
        }

        if (!liveDiscussion.noteIds.has(Number(discussion.note_id))) {
          removedDeletedCount += 1;
          return false;
        }

        existingUnresolvedCount += 1;
        return true;
      }),
    }))
    .filter((run) => run.discussions.length > 0);

  return {
    reviewHistory: filteredReviewHistory,
    removedResolvedCount,
    removedDeletedCount,
    existingUnresolvedCount,
  };
};

export const buildDiscussionPosition = ({
  mergeRequest,
  review,
}: {
  mergeRequest: MergeRequestPositionContextEntity;
  review: ReviewItemEntity;
}) => {
  const positionBase = {
    baseSha: mergeRequest.diff_refs.base_sha,
    headSha: mergeRequest.diff_refs.head_sha,
    startSha: mergeRequest.diff_refs.base_sha,
    positionType: "text" as const,
    newPath: review.file_path,
    oldPath: review.file_path,
  };

  if (review.new_line !== undefined) {
    return {
      ...positionBase,
      newLine: String(review.new_line),
    };
  }

  return {
    ...positionBase,
    oldLine: String(review.old_line),
  };
};

export class GitLabService {
  private readonly diffPageSize = 20;
  private readonly discussionPageSize = 100;
  private readonly maxGitDiffPage =
    argv["max-git-diff-page"] ?? Number.POSITIVE_INFINITY;
  private readonly client: Gitlab;
  private readonly projectId = requireArg({
    name: "project-id",
    value: argv["project-id"],
  });
  private readonly mrIid = parseInt(
    requireArg({
      name: "mr-iid",
      value: argv["mr-iid"],
    }),
    10,
  );
  private readonly displayLanguages = getDisplayLanguages({
    langs: argv["lang"],
    collapsedLangs: argv["collapsed-lang"],
    sourceLanguage: argv["thinking-lang"],
  });
  private readonly collapsedLanguages = argv["collapsed-lang"];
  private readonly htmlMarkerPrefix = argv["html-marker-prefix"];
  private readonly reviewMarker = `${this.htmlMarkerPrefix}-review-marker`;
  private readonly reviewingMarker =
    `${this.htmlMarkerPrefix}-reviewing-marker`;
  private readonly summaryMarker = `${this.htmlMarkerPrefix}-summary-marker`;
  private readonly reviewDataStartTag =
    `${this.htmlMarkerPrefix}-review-data-start`;
  private readonly reviewDataEndTag =
    `${this.htmlMarkerPrefix}-review-data-end`;

  constructor() {
    this.client = new Gitlab({
      host: argv["gitlab-url"],
      token: argv["gitlab-token"],
    });
  }

  private withGitLabRequestLogging = async <T>({
    request,
  }: {
    request: () => Promise<T>;
  }): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      const failureMessage = buildGitLabRequestFailureMessage({ error });

      if (failureMessage) {
        logger.error(failureMessage);
      }

      throw error;
    }
  };

  getMergeRequest = async () =>
    this.withGitLabRequestLogging({
      request: () => this.client.MergeRequests.show(this.projectId, this.mrIid),
    });

  private getMergeRequestNotes = async (): Promise<MergeRequestNoteSchema[]> =>
    this.withGitLabRequestLogging({
      request: () =>
        this.client.MergeRequestNotes.all(this.projectId, this.mrIid),
    });

  private getMergeRequestDiscussions = async (): Promise<
    DiscussionSchema[]
  > => {
    const discussions: DiscussionSchema[] = [];

    for (let page = 1; ; page += 1) {
      const pageDiscussions = await this.withGitLabRequestLogging({
        request: () =>
          this.client.MergeRequestDiscussions.all(this.projectId, this.mrIid, {
            page,
            perPage: this.discussionPageSize,
          }),
      });

      if (pageDiscussions.length === 0) {
        break;
      }

      discussions.push(...pageDiscussions);

      if (pageDiscussions.length < this.discussionPageSize) {
        break;
      }
    }

    return discussions;
  };

  getMergeRequestDiffs = async (): Promise<MergeRequestDiffsResultDataType> => {
    const pages: MergeRequestDiffPageDataType[] = [];
    const errors: string[] = [];

    // GitLab paginates merge request diffs by page/per_page. With perPage fixed
    // at 20 here, a max page limit of N means at most N * 20 diff entries are
    // handed to the LLM.
    for (let page = 1; page <= this.maxGitDiffPage; page += 1) {
      const diffs = await this.withGitLabRequestLogging({
        request: () =>
          this.client.MergeRequests.allDiffs(this.projectId, this.mrIid, {
            page,
            perPage: this.diffPageSize,
          }),
      });

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
    MergeRequestNoteSchema | undefined
  > => {
    const mrNotes = await this.getMergeRequestNotes();

    return mrNotes.find((note) =>
      note.body.includes(`<!-- ${this.summaryMarker} -->`),
    );
  };

  getReviewingMarkerNote = async ({
    ignoreNoteId,
  }: {
    ignoreNoteId?: number;
  } = {}): Promise<MergeRequestNoteSchema | undefined> => {
    const mrNotes = await this.getMergeRequestNotes();

    return mrNotes.find(
      (note) =>
        note.body.includes(`<!-- ${this.reviewingMarker} -->`) &&
        note.id !== ignoreNoteId,
    );
  };

  getReviewHistoryFromSummary = ({
    noteBody,
  }: {
    noteBody: string;
  }): ReviewHistoryRunEntity[] => {
    const dataMatch = noteBody.match(
      new RegExp(
        `<!-- ${this.reviewDataStartTag} -->\\s*<!--\\s*([\\s\\S]*?)\\s*-->\\s*<!-- ${this.reviewDataEndTag} -->`,
      ),
    );

    if (!dataMatch) {
      return [];
    }

    try {
      const encodedPayload = dataMatch[1]?.trim();

      if (!encodedPayload) {
        return [];
      }

      const parsed = JSON.parse(
        Buffer.from(encodedPayload, "base64").toString("utf8"),
      );

      return normalizeDecodedReviewHistory({
        value: parsed,
      });
    } catch {
      logger.warn(
        "Failed to parse previous review history from summary comment",
      );
      return [];
    }
  };

  getUnresolvedReviewHistoryFromSummary = async ({
    noteBody,
  }: {
    noteBody: string;
  }): Promise<ReviewHistoryRunEntity[]> => {
    const reviewHistory = this.getReviewHistoryFromSummary({ noteBody });

    if (reviewHistory.length === 0) {
      return [];
    }

    const discussions = await this.getMergeRequestDiscussions();

    const {
      reviewHistory: filteredHistory,
      removedResolvedCount,
      removedDeletedCount,
      existingUnresolvedCount,
    } = filterExistingUnresolvedReviewHistory({
      reviewHistory,
      discussions,
    });

    if (removedResolvedCount > 0 || removedDeletedCount > 0) {
      logger.info(
        `[GitLab] Review history reconciliation: removed ${removedResolvedCount} resolved item(s), removed ${removedDeletedCount} deleted item(s), kept ${existingUnresolvedCount} existing unresolved item(s)`,
      );
    }

    return filteredHistory;
  };

  deleteMergeRequestNote = async ({ noteId }: { noteId: number }) =>
    this.withGitLabRequestLogging({
      request: () =>
        this.client.MergeRequestNotes.remove(
          this.projectId,
          this.mrIid,
          noteId,
        ),
    });

  createReviewDiscussion = async ({
    review,
    mergeRequest,
  }: {
    review: ReviewItemEntity;
    mergeRequest: MergeRequestPositionContextEntity;
  }): Promise<ReviewHistoryDiscussionEntity> => {
    if (review.new_line === undefined && review.old_line === undefined) {
      throw new Error(
        "Review must include at least one of new_line or old_line",
      );
    }

    const marker = `<!-- ${this.reviewMarker} -->`;
    const commentBody = buildReviewDiscussionBody({
      marker,
      review,
      displayLanguages: this.displayLanguages,
      collapsedLanguages: this.collapsedLanguages,
      sourceLanguage: argv["thinking-lang"],
    });

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
    // Single-line discussions should anchor to one side only. When both line
    // numbers are present, prefer the new side so GitLab does not render the
    // same thread twice in split diff views.
    const position = buildDiscussionPosition({
      mergeRequest,
      review,
    });

    const discussion: DiscussionSchema = await this.withGitLabRequestLogging({
      request: () =>
        this.client.MergeRequestDiscussions.create(
          this.projectId,
          this.mrIid,
          commentBody,
          { position },
        ),
    });

    const createdNote = discussion.notes?.find((note) => !note.system);

    if (!createdNote?.id) {
      throw new Error(
        "GitLab discussion create response did not include the created note id",
      );
    }

    return {
      discussion_id: discussion.id,
      note_id: String(createdNote.id),
      content: {
        suggestion:
          getLocalizedRecordValue({
            record: review.suggestions,
            language: argv["thinking-lang"],
          })?.abstract ??
          Object.values(review.suggestions)[0]?.abstract ??
          "",
        file_path: review.file_path,
        old_line: review.old_line ?? null,
        new_line: review.new_line ?? null,
      },
    };
  };

  createSummaryNote = async ({ summaryBody }: { summaryBody: string }) =>
    this.withGitLabRequestLogging({
      request: () =>
        this.client.MergeRequestNotes.create(
          this.projectId,
          this.mrIid,
          summaryBody,
        ),
    });

  createReviewingMarkerNote = async ({
    noteBody,
  }: {
    noteBody: string;
  }): Promise<MergeRequestNoteSchema> =>
    this.withGitLabRequestLogging({
      request: () =>
        this.client.MergeRequestNotes.create(
          this.projectId,
          this.mrIid,
          noteBody,
        ),
    });
}

export const gitlabService = new GitLabService();
