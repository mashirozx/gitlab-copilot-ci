import { t } from "../../i18n";
import type {
  ReviewHistoryDiscussionEntity,
  ReviewHistoryRunEntity,
} from "../../services/gitlab.types";
import type {
  ReviewItemEntity,
  ReviewResponseEntity,
} from "../../types/review.types";
import { argv } from "../argv";
import {
  buildCurrentCommitReference,
  buildDetailsBlock,
  buildInlineReviewNoteUrl,
  getLocalizedRecordValue,
  getRankInlineMath,
  normalizeReviewRank,
} from "./comment-helper";
import {
  buildErrorsSummarySection,
  encodeReviewHistory,
  trimReviewHistoryRuns,
} from "./summary-comment-builder";

const isSameReviewLocation = ({
  left,
  right,
}: {
  left: Pick<ReviewItemEntity, "file_path" | "new_line" | "old_line">;
  right: Pick<
    ReviewHistoryDiscussionEntity["content"],
    "file_path" | "new_line" | "old_line"
  >;
}): boolean => {
  return (
    left.file_path === right.file_path &&
    (left.new_line ?? null) === (right.new_line ?? null) &&
    (left.old_line ?? null) === (right.old_line ?? null)
  );
};

const formatReviewLocationLabel = ({
  review,
}: {
  review: Pick<ReviewItemEntity, "file_path" | "new_line" | "old_line">;
}): string => {
  const line = review.new_line ?? review.old_line ?? "?";

  return `${review.file_path}:${line}`;
};

const formatLinkedReviewLocation = ({
  review,
  currentRunDiscussions,
}: {
  review: Pick<ReviewItemEntity, "file_path" | "new_line" | "old_line">;
  currentRunDiscussions: ReviewHistoryDiscussionEntity[];
}): string => {
  const locationLabel = formatReviewLocationLabel({ review });
  const matchedDiscussion = currentRunDiscussions.find((discussion) =>
    isSameReviewLocation({
      left: review,
      right: discussion.content,
    }),
  );

  if (!matchedDiscussion) {
    return `\`${locationLabel}\``;
  }

  const noteUrl = buildInlineReviewNoteUrl({
    noteId: matchedDiscussion.note_id,
  });

  if (!noteUrl) {
    return `\`${locationLabel}\``;
  }

  return `[\`${locationLabel}\`](${noteUrl})`;
};

const formatReviewLine = ({
  response,
  language,
  currentRunDiscussions,
}: {
  response: ReviewResponseEntity;
  language: string;
  currentRunDiscussions: ReviewHistoryDiscussionEntity[];
}): string | null => {
  if (response.reviews.length === 0) {
    return null;
  }

  return response.reviews
    .flatMap((review) => {
      const localizedSuggestion = getLocalizedRecordValue({
        record: review.suggestions,
        language,
      });

      if (
        !localizedSuggestion ||
        localizedSuggestion.abstract.trim().length === 0
      ) {
        return [];
      }

      return [
        `${formatLinkedReviewLocation({ review, currentRunDiscussions })} ${getRankInlineMath({ rank: normalizeReviewRank({ rank: review.rank }), lang: language })} ${localizedSuggestion.abstract}`,
      ];
    })
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
};

const maybeCollapseSection = ({
  content,
  shouldCollapse,
  language,
}: {
  content: string;
  shouldCollapse: boolean;
  language: string;
}): string => {
  if (!shouldCollapse) {
    return content;
  }

  return buildDetailsBlock({
    summary: t("reviewSummary.details.summary", { lang: language }),
    content,
  });
};

export const buildSummaryCommentWithSnippet = ({
  response,
  reviewHistory,
  errors,
  hasPreviousReviewHistory,
  currentRunDiscussions = [],
  snippetUrl,
}: {
  response: ReviewResponseEntity;
  reviewHistory: ReviewHistoryRunEntity[];
  errors: string[];
  hasPreviousReviewHistory: boolean;
  currentRunDiscussions?: ReviewHistoryDiscussionEntity[];
  snippetUrl: string;
}): string => {
  const markerPrefix = argv["html-marker-prefix"];
  const summaryMarker = `${markerPrefix}-summary-marker`;
  const reviewDataStartTag = `${markerPrefix}-review-data-start`;
  const reviewDataEndTag = `${markerPrefix}-review-data-end`;
  const thinkingLang = argv["thinking-lang"];
  const readableModelName =
    response.readableModelName.trim().length > 0
      ? response.readableModelName
      : "";
  const title = t("reviewSummary.title", {
    readableModelName,
    lang: thinkingLang,
  });
  const commitReference = buildCurrentCommitReference();
  const reviewSummaryContent = [
    t("reviewSummary.reviewList.header", {
      count: response.reviews.length,
      commitReference,
      lang: thinkingLang,
    }),
    formatReviewLine({
      response,
      language: thinkingLang,
      currentRunDiscussions,
    }),
    hasPreviousReviewHistory
      ? [
          "***",
          t("reviewSummary.reviewList.footer", { lang: thinkingLang }),
        ].join("\n\n")
      : null,
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
  const encodedReviewHistory = encodeReviewHistory({
    reviewHistory: trimReviewHistoryRuns({
      reviewHistory,
    }),
  });

  let summaryBody = [
    `<!-- ${summaryMarker} -->`,
    `# ${title}`,
    `[${t("reviewSummary.viewDetail", { lang: thinkingLang })}](${snippetUrl})`,
    `## ${t("reviewSummary.reviewList.title", { lang: thinkingLang })}`,
    maybeCollapseSection({
      content: reviewSummaryContent,
      shouldCollapse: argv["collapse-review-summary"],
      language: thinkingLang,
    }),
  ].join("\n\n");

  summaryBody += buildErrorsSummarySection({
    errors,
  });
  summaryBody += `\n\n<!-- ${reviewDataStartTag} -->\n<!--\n${encodedReviewHistory}\n-->\n<!-- ${reviewDataEndTag} -->`;

  return summaryBody;
};
