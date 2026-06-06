#!/usr/bin/env bun

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initI18n } from "./i18n";
import { buildCopilotPrompt } from "./prompts.ts";
import { runCopilotReview } from "./services/copilot";
import type { ReviewHistoryDiscussionEntity } from "./services/gitlab.types";
import { logger } from "./services/logger";
import { runPiReview } from "./services/pi";
import { argv } from "./utils/argv";
import { getRequestedResponseLanguages } from "./utils/composers/review-comment-builder";
import {
  buildSummaryNote,
  trimReviewHistoryRuns,
} from "./utils/composers/summary-comment-builder";
import {
  buildDiffPageFileContent,
  colorizeDiffLineCode,
  recomputeReviewPositionFromDiffReference,
} from "./utils/diff-files";
import { formatReviewLocation } from "./utils/review-helpers";
import { buildReviewHistoryFileContent } from "./utils/review-history-file";
import { getFormattedVersion } from "./utils/version";

const main = async () => {
  const requestedMetaOutput = process.argv
    .slice(2)
    .some(
      (arg) =>
        arg === "-h" || arg === "--help" || arg === "-v" || arg === "--version",
    );

  if (requestedMetaOutput) {
    return;
  }

  const errors: string[] = [];
  let reviewingMarkerNoteId: number | null = null;
  let tempDir: string | null = null;
  const isDryRun = argv["dry-run"];
  const [{ gitlabService }, reviewProcess] = await Promise.all([
    import("./services/gitlab"),
    import("./utils/review-process"),
  ]);
  const {
    buildReviewingMarkerNoteBody,
    shouldSkipForStaleCommit,
    waitForPendingReviewToFinish,
  } = reviewProcess;

  await initI18n({
    preloadLanguageTags: getRequestedResponseLanguages({
      langs: argv["lang"],
      collapsedLangs: argv["collapsed-lang"],
      sourceLanguage: argv["thinking-lang"],
    }),
  });

  if (isDryRun) {
    logger.info(
      "[DRY RUN] Starting real review execution with GitLab writes disabled",
    );
    logger.info("[Arguments]", JSON.stringify(argv, null, 2));
  }

  logger.silent(`Gitlab Copilot CI`);
  logger.box(getFormattedVersion());

  if (!isDryRun) {
    if (!(await waitForPendingReviewToFinish())) {
      return;
    }
  }

  // A. Fetch MR details and diff (SHA values needed for comment positioning)
  const mr = await gitlabService.getMergeRequest();

  if (
    shouldSkipForStaleCommit({ mergeRequestHeadSha: mr.diff_refs.head_sha })
  ) {
    return;
  }

  if (!isDryRun) {
    const reviewingMarkerNote = await gitlabService.createReviewingMarkerNote({
      noteBody: buildReviewingMarkerNoteBody({
        htmlMarkerPrefix: argv["html-marker-prefix"],
      }),
    });
    reviewingMarkerNoteId = reviewingMarkerNote.id;
    logger.info("[GitLab] Posted review-in-progress marker note");
  }

  try {
    const existingSummaryNote = await gitlabService.getExistingSummaryNote();
    const reviewHistory = existingSummaryNote
      ? await gitlabService.getUnresolvedReviewHistoryFromSummary({
          noteBody: existingSummaryNote.body,
        })
      : [];
    const historyItems = reviewHistory.flatMap((run) =>
      run.discussions.map((discussion) => discussion.content),
    );

    logger.info(
      `[GitLab] Loaded ${historyItems.length} active prior inline review item(s) from ${reviewHistory.length} summary history run(s)`,
    );

    const {
      changes,
      pages: diffPages,
      errors: diffFetchErrors,
    } = await gitlabService.getMergeRequestDiffs();
    errors.push(...diffFetchErrors);
    const createdTempDir = mkdtempSync(join(tmpdir(), "copilot-review-"));
    tempDir = createdTempDir;

    const diffFilePaths = diffPages.map(({ page, diffs }) => {
      const diffFilePath = join(createdTempDir, `mr-diff.page-${page}.diff`);
      writeFileSync(diffFilePath, buildDiffPageFileContent({ diffs }), "utf-8");
      return diffFilePath;
    });
    const reviewHistoryFilePath =
      historyItems.length > 0
        ? join(createdTempDir, "prior-inline-review-history.md")
        : null;

    if (reviewHistoryFilePath) {
      writeFileSync(
        reviewHistoryFilePath,
        buildReviewHistoryFileContent({ historyItems }),
        "utf-8",
      );
      logger.info(
        `Wrote prior review history file with ${historyItems.length} item(s) to ${reviewHistoryFilePath}`,
      );
    }

    logger.info(
      `[GitLab] Loaded ${changes.length} diff file entries across ${diffPages.length} page(s)`,
    );

    logger.info(`[LLM] Using service: ${argv["agent"]}`);

    // B. Ask the configured LLM CLI to review the diff and read repo files as needed
    const reviewRunner =
      argv["agent"] === "pi" ? runPiReview : runCopilotReview;
    const prompt = buildCopilotPrompt({
      diffFilePaths,
      title: mr.title,
      description: mr.description,
      reviewHistoryFilePath: reviewHistoryFilePath ?? undefined,
    });
    const response = await reviewRunner({
      prompt,
    });
    const reviews = [...response.reviews];

    if (response.errors) errors.push(...response.errors);

    logger.success("Review results:");
    logger.log(JSON.stringify(response, null, 2));

    // C. Post inline review comments and store newly created review history entries
    const createdDiscussions: ReviewHistoryDiscussionEntity[] = [];
    if (!isDryRun) {
      if (
        !(await waitForPendingReviewToFinish({
          ignoreReviewingNoteId: reviewingMarkerNoteId ?? undefined,
        }))
      ) {
        return;
      }

      const latestMergeRequest = await gitlabService.getMergeRequest();
      if (
        shouldSkipForStaleCommit({
          mergeRequestHeadSha: latestMergeRequest.diff_refs.head_sha,
        })
      ) {
        return;
      }

      const diffLineMatchState = new Map<string, number>();
      for (const [index, item] of reviews.entries()) {
        try {
          const discussion = await gitlabService.createReviewDiscussion({
            review: item,
            mergeRequest: latestMergeRequest,
          });
          createdDiscussions.push(discussion);
          logger.success(
            `Successfully posted comment to ${formatReviewLocation({ review: item })} (discussion: ${discussion.discussion_id})`,
          );
        } catch (e) {
          const recomputedReview = recomputeReviewPositionFromDiffReference({
            review: item,
            diffFilePaths,
            matchState: diffLineMatchState,
          });

          if (
            item.diff_line_code !== undefined &&
            recomputedReview &&
            (recomputedReview.file_path !== item.file_path ||
              recomputedReview.new_line !== item.new_line ||
              recomputedReview.old_line !== item.old_line)
          ) {
            try {
              logger.warn(
                `Retrying ${formatReviewLocation({ review: item })} using ${item.diff_file} to find ${colorizeDiffLineCode(item.diff_line_code)} -> ${formatReviewLocation({ review: recomputedReview })}`,
              );

              const discussion = await gitlabService.createReviewDiscussion({
                review: recomputedReview,
                mergeRequest: latestMergeRequest,
              });
              reviews[index] = recomputedReview;
              createdDiscussions.push(discussion);
              logger.success(
                `Successfully posted comment to ${formatReviewLocation({ review: recomputedReview })} after recomputing position by using ${item.diff_file} to find${colorizeDiffLineCode(item.diff_line_code)} (discussion: ${discussion.discussion_id})`,
              );
              continue;
            } catch (retryError) {
              const retryMsg = `Failed to post recomputed comment for ${formatReviewLocation({ review: recomputedReview })} by using ${item.diff_file} to find ${colorizeDiffLineCode(item.diff_line_code)}: ${retryError instanceof Error ? retryError.message : String(retryError)}`;
              logger.error(retryMsg);
              logger.error(retryError);
              errors.push(retryMsg);
            }
          }

          const msg = `Failed to post comment for ${formatReviewLocation({ review: item })}: ${e instanceof Error ? e.message : String(e)}`;
          logger.error(msg);
          logger.debug(
            "Failed with payload :",
            JSON.stringify({ item }, null, 2),
          );
          logger.error(e);
          errors.push(msg);
        }
      }
    } else {
      logger.info(
        `[DRY RUN] Skipping ${reviews.length} inline review write(s) and summary note write`,
      );
    }

    // D. Replace summary comment with updated embedded review history
    const summaryBody = buildSummaryNote({
      response: {
        ...response,
        reviews,
      },
      reviewHistory: trimReviewHistoryRuns({
        reviewHistory:
          createdDiscussions.length > 0
            ? [...reviewHistory, { discussions: createdDiscussions }]
            : reviewHistory,
      }),
      errors,
      hasPreviousReviewHistory: reviewHistory.length > 0,
      currentRunDiscussions: createdDiscussions,
    });

    if (isDryRun) {
      logger.debug(summaryBody);
      return;
    }

    try {
      if (existingSummaryNote) {
        await gitlabService.deleteMergeRequestNote({
          noteId: existingSummaryNote.id,
        });
        logger.success("Deleted existing copilot review summary comment");
      }

      await gitlabService.createSummaryNote({
        summaryBody,
      });
      logger.success("Posted copilot review summary comment");
    } catch (e) {
      const msg = `Failed to post summary comment: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(msg);
      logger.error(e);
    }
  } finally {
    if (reviewingMarkerNoteId !== null) {
      try {
        await gitlabService.deleteMergeRequestNote({
          noteId: reviewingMarkerNoteId,
        });
        logger.info("[GitLab] Removed review-in-progress marker note");
      } catch (error) {
        logger.error(
          `[GitLab] Failed to remove review-in-progress marker note: ${error instanceof Error ? error.message : String(error)}`,
        );
        logger.error(error);
      }
    }

    if (tempDir) {
      rmSync(tempDir, {
        recursive: true,
        force: true,
      });
    }
  }
};

main().catch((e) => logger.error(e));
