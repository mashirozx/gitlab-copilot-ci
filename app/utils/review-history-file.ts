import { REVIEW_HISTORY_FILE_INTRO } from "../prompts";
import type { ReviewHistoryContentEntity } from "../services/gitlab.types";

const NO_LINE_MARKER = "-";

const formatReviewHistoryLine = (line: number | null): number | string => {
  return line ?? NO_LINE_MARKER;
};

export const buildReviewHistoryFileContent = ({
  historyItems,
}: {
  historyItems: ReviewHistoryContentEntity[];
}): string => {
  const reviewSections = historyItems.map(
    (item) => `## Diff
| File path | New line | Old line |
| :---- | :---- | :------ |
| ${item.file_path} | ${formatReviewHistoryLine(item.new_line)} | ${formatReviewHistoryLine(item.old_line)} |

## Suggestions

${item.suggestion}`,
  );

  return `${REVIEW_HISTORY_FILE_INTRO}

${reviewSections.join("\n\n***\n\n")}`;
};
