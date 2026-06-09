import type { ChildProcess } from "node:child_process";
import { gitlabService } from "../services/gitlab";
import { logger } from "../services/logger";
import { argv } from "./argv";
import { getCurrentCommitSha } from "./commit-reference";
import { formatPollInterval } from "./poll-interval";
import * as time from "./time";

const stopReviewAgentProcess = async ({
  childProcess,
}: {
  childProcess: ChildProcess;
}): Promise<void> => {
  if (childProcess.exitCode !== null) {
    return;
  }

  const waitForChildClose = new Promise<void>((resolve) => {
    const handleClose = (): void => {
      childProcess.off("exit", handleClose);
      resolve();
    };

    childProcess.once("close", handleClose);
    childProcess.once("exit", handleClose);
  });
  const waitForStreamClose = (
    stream: NodeJS.ReadableStream | null | undefined,
  ): Promise<void> => {
    if (!stream || "closed" in stream === false || stream.closed) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const handleClose = (): void => {
        stream.off("end", handleClose);
        resolve();
      };

      stream.once("close", handleClose);
      stream.once("end", handleClose);
    });
  };
  const waitForStreamDrains = Promise.all([
    waitForStreamClose(childProcess.stdout),
    waitForStreamClose(childProcess.stderr),
  ]).then(() => undefined);

  const childPid = childProcess.pid;

  if (childPid) {
    try {
      process.kill(-childPid, "SIGKILL");
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : null;

      if (errorCode !== "ESRCH") {
        logger.warn(
          `[GitLab] Failed to SIGKILL review agent process group ${childPid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  try {
    childProcess.kill("SIGKILL");
  } catch (error) {
    logger.warn(
      `[GitLab] Failed to SIGKILL review agent via child process handle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!childPid) {
    return;
  }

  try {
    process.kill(childPid, "SIGKILL");
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : null;

    if (errorCode !== "ESRCH") {
      logger.warn(
        `[GitLab] Failed to SIGKILL review agent by pid ${childPid}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  await waitForChildClose;
  await waitForStreamDrains;
};

const getReviewMaxPendingTimeMs = (): number => {
  return argv["review-max-pending-time"];
};

const getMrCheckIntervalMs = (): number => {
  return argv["mr-check-interval"];
};

export const waitForPendingReviewToFinish = async ({
  ignoreReviewingNoteId,
}: {
  ignoreReviewingNoteId?: number;
} = {}): Promise<boolean> => {
  const reviewMaxPendingTimeMs = getReviewMaxPendingTimeMs();
  const mrCheckIntervalMs = getMrCheckIntervalMs();
  const waitStartedAtMs = time.getNowEpochMilliseconds();
  const pollIntervalText = formatPollInterval({
    milliseconds: mrCheckIntervalMs,
  });

  while (true) {
    const reviewingMarkerNote = await gitlabService.getReviewingMarkerNote({
      ignoreNoteId: ignoreReviewingNoteId,
    });

    if (!reviewingMarkerNote) {
      return true;
    }

    const mergeRequest = await gitlabService.getMergeRequest();

    if (
      shouldSkipForStaleCommit({
        mergeRequestHeadSha: mergeRequest.diff_refs.head_sha,
      })
    ) {
      return false;
    }

    const waitedMs = time.getNowEpochMilliseconds() - waitStartedAtMs;
    if (waitedMs >= reviewMaxPendingTimeMs) {
      logger.warn(
        `[GitLab] Review is still pending after ${formatPollInterval({ milliseconds: reviewMaxPendingTimeMs })}. Skipping this run.`,
      );
      return false;
    }

    logger.warn(
      `[GitLab] Another review is in progress. Waiting ${pollIntervalText} before checking again.`,
    );
    await time.sleepMilliseconds({
      milliseconds: mrCheckIntervalMs,
    });
  }
};

export const shouldSkipForStaleCommit = ({
  mergeRequestHeadSha,
}: {
  mergeRequestHeadSha: string;
}): boolean => {
  const commitSha = getCurrentCommitSha();

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

export const cancelReviewForStaleCommit = async ({
  childProcess,
  reviewingMarkerNoteId,
  onReviewingMarkerDeleted,
  onStaleCommitDetected,
}: {
  childProcess: ChildProcess;
  reviewingMarkerNoteId?: number | null;
  onReviewingMarkerDeleted?: () => void;
  onStaleCommitDetected?: () => void;
}): Promise<boolean> => {
  const mergeRequest = await gitlabService.getMergeRequest();

  if (
    !shouldSkipForStaleCommit({
      mergeRequestHeadSha: mergeRequest.diff_refs.head_sha,
    })
  ) {
    return false;
  }

  logger.error(
    "[GitLab] Merge request head changed while the review agent was running. Stopping the agent and skipping all review writes.",
  );
  onStaleCommitDetected?.();

  await stopReviewAgentProcess({
    childProcess,
  });

  logger.info(
    "[GitLab] Review agent stopped after stale-commit detection. Deleting the review-in-progress marker note.",
  );

  if (reviewingMarkerNoteId !== null && reviewingMarkerNoteId !== undefined) {
    try {
      await gitlabService.deleteMergeRequestNote({
        noteId: reviewingMarkerNoteId,
      });
      onReviewingMarkerDeleted?.();
      logger.info(
        "[GitLab] Deleted the review-in-progress marker note because the run is exiting after the merge request head changed during agent execution.",
      );
    } catch (error) {
      logger.error(
        `[GitLab] Failed to remove stale review-in-progress marker note: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error(error);
    }
  }

  return true;
};

export const startStaleCommitMonitor = ({
  childProcess,
  reviewingMarkerNoteId,
  onReviewingMarkerDeleted,
  onStaleCommitDetected,
}: {
  childProcess: ChildProcess;
  reviewingMarkerNoteId?: number | null;
  onReviewingMarkerDeleted?: () => void;
  onStaleCommitDetected?: () => void;
}): {
  stop: () => Promise<void>;
} => {
  const mrCheckIntervalMs = getMrCheckIntervalMs();
  let stopped = false;
  let isChecking = false;
  let activeCheck: Promise<void> | null = null;
  const intervalId = setInterval(() => {
    if (stopped || isChecking) {
      return;
    }

    isChecking = true;
    activeCheck = cancelReviewForStaleCommit({
      childProcess,
      reviewingMarkerNoteId,
      onReviewingMarkerDeleted,
      onStaleCommitDetected,
    })
      .then((wasCancelled) => {
        if (wasCancelled) {
          stopped = true;
          clearInterval(intervalId);
        }
      })
      .catch((error) => {
        logger.error(
          `[GitLab] Failed to poll merge request head while the review agent was running: ${error instanceof Error ? error.message : String(error)}`,
        );
        logger.error(error);
      })
      .finally(() => {
        isChecking = false;
        activeCheck = null;
      });
  }, mrCheckIntervalMs);

  return {
    stop: async () => {
      stopped = true;
      clearInterval(intervalId);
      await activeCheck;
    },
  };
};
