import type { ChildProcess } from "node:child_process";
import { startStaleCommitMonitor } from "../utils/review-process";

export const createReviewAgentStartedHandler = ({
  getReviewingMarkerNoteId,
  onReviewingMarkerDeleted,
  onStaleCommitDetected,
}: {
  getReviewingMarkerNoteId: () => number | null;
  onReviewingMarkerDeleted: () => void;
  onStaleCommitDetected: () => void;
}) => {
  let activeMonitorStop: Promise<void> | null = null;

  const onChildProcessStarted = ({
    childProcess,
  }: {
    childProcess: ChildProcess;
  }): void => {
    const staleCommitMonitor = startStaleCommitMonitor({
      childProcess,
      reviewingMarkerNoteId: getReviewingMarkerNoteId(),
      onStaleCommitDetected,
      onReviewingMarkerDeleted,
    });

    childProcess.once("close", () => {
      activeMonitorStop = staleCommitMonitor.stop().finally(() => {
        activeMonitorStop = null;
      });
    });
  };

  return {
    onChildProcessStarted,
    waitForActiveMonitorStop: async (): Promise<void> => {
      await activeMonitorStop;
    },
  };
};
