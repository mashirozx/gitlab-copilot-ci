import { t } from "../../i18n";
import type {
  ReviewHistoryDiscussionEntity,
  ReviewHistoryRunEntity,
} from "../../services/gitlab.types";
import type { ReviewResponseEntity } from "../../types/review.types";
import { argv } from "../argv";
import {
  buildErrorsSummarySection,
  encodeReviewHistory,
  trimReviewHistoryRuns,
} from "./summary-comment-builder";

export const buildSummaryCommentWithSnippet = ({
  response,
  reviewHistory,
  errors,
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
  const encodedReviewHistory = encodeReviewHistory({
    reviewHistory: trimReviewHistoryRuns({
      reviewHistory,
    }),
  });

  let summaryBody = [
    `<!-- ${summaryMarker} -->`,
    `# ${title}`,
    `[${t("reviewSummary.viewDetail", { lang: thinkingLang })}](${snippetUrl})`,
  ].join("\n\n");

  summaryBody += buildErrorsSummarySection({
    errors,
  });
  summaryBody += `\n\n<!-- ${reviewDataStartTag} -->\n<!--\n${encodedReviewHistory}\n-->\n<!-- ${reviewDataEndTag} -->`;

  return summaryBody;
};
