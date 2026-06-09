import { t } from "../../i18n";
import {
  buildCurrentCommitReference,
  buildJobDetailUrl,
} from "./comment-helper";

export const buildReviewingMarkerNoteBody = ({
  htmlMarkerPrefix,
}: {
  htmlMarkerPrefix: string;
}): string => {
  const reviewingMarker = `${htmlMarkerPrefix}-reviewing-marker`;
  const commitReference = buildCurrentCommitReference();
  const body = t("reviewProcess.reviewingMarker.body", {
    commitReference,
  });
  const manualDeleteHint = t("reviewProcess.reviewingMarker.manualDeleteHint", {
    linkToJobDetail: buildJobDetailUrl() ?? "#",
  });

  return `<!-- ${reviewingMarker} -->
${body}

***

<sub>${manualDeleteHint}</sub>`;
};
