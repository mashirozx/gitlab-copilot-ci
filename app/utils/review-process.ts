import { REVIEW_PENDING_POLL_INTERVAL_MS } from "../constants";
import { gitlabService } from "../services/gitlab";
import { logger } from "../services/logger";
import { argv } from "./argv";
import {
  buildCurrentCommitReference,
  getCurrentCommitSha,
} from "./commit-reference";
import * as time from "./time";

export const currentCommitSha = (): string | undefined => getCurrentCommitSha();

const processMaxPendingTimeMinutes = argv["process-max-pending-time"];

export const buildReviewingMarkerNoteBody = ({
  htmlMarkerPrefix,
}: {
  htmlMarkerPrefix: string;
}): string => {
  const reviewingMarker = `${htmlMarkerPrefix}-reviewing-marker`;
  const commitReference = buildCurrentCommitReference();

  return `<!-- ${reviewingMarker} -->
⚠️ Code review is in progress... I am reviewing commit ${commitReference}. To avoid conflicts, I will hold further reviews until the current one is concluded.

***

<sub>Feel free to manually delete this comment if the review process seems stuck, which should unblock it. Just make sure to check the status of the latest review CI workflow first—ensure it's still running, or trigger a rerun if necessary.</sub>`;
};

export const waitForPendingReviewToFinish = async ({
  ignoreReviewingNoteId,
}: {
  ignoreReviewingNoteId?: number;
} = {}): Promise<boolean> => {
  const maxPendingTimeMs = processMaxPendingTimeMinutes * 60_000;
  const waitStartedAtMs = time.getNowEpochMilliseconds();
  const pollIntervalSeconds = Math.ceil(REVIEW_PENDING_POLL_INTERVAL_MS / 1000);

  while (true) {
    const reviewingMarkerNote = await gitlabService.getReviewingMarkerNote({
      ignoreNoteId: ignoreReviewingNoteId,
    });

    if (!reviewingMarkerNote) {
      return true;
    }

    const waitedMs = time.getNowEpochMilliseconds() - waitStartedAtMs;
    if (waitedMs >= maxPendingTimeMs) {
      logger.warn(
        `[GitLab] Review is still pending after ${processMaxPendingTimeMinutes} minute(s). Skipping this run.`,
      );
      return false;
    }

    logger.warn(
      `[GitLab] Another review is in progress. Waiting ${pollIntervalSeconds} seconds before checking again.`,
    );
    await time.sleepMilliseconds({
      milliseconds: REVIEW_PENDING_POLL_INTERVAL_MS,
    });
  }
};

export const shouldSkipForStaleCommit = ({
  mergeRequestHeadSha,
}: {
  mergeRequestHeadSha: string;
}): boolean => {
  const commitSha = currentCommitSha();

  if (!commitSha) {
    logger.warn(
      "[GitLab] CI_COMMIT_SHA is not available, so stale-job commit verification is being skipped.",
    );
    return false;
  }

  if (commitSha === mergeRequestHeadSha) {
    return false;
  }

  logger.warn(
    `[GitLab] Skipping review for ${commitSha} because the merge request head moved to ${mergeRequestHeadSha}.`,
  );
  return true;
};
