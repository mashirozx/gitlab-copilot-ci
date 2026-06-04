#!/usr/bin/env bun

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCopilotPrompt } from "./prompts";
import { runCopilotReview } from "./services/copilot";
import { gitlabService } from "./services/gitlab";
import type { ReviewHistoryDiscussionEntity } from "./services/gitlab.types";
import { logger } from "./services/logger";
import { runPiReview } from "./services/pi";
import { argv } from "./utils/argv";
import {
  buildDiffPageFileContent,
  colorizeDiffLineCode,
  recomputeReviewPositionFromDiffReference,
} from "./utils/diff-files";
import { formatReviewLocation } from "./utils/review-helpers";
import {
  getPromptTranslationLangs,
  normalizeReviewResponse,
} from "./utils/review-output";
import {
  buildReviewingMarkerNoteBody,
  shouldSkipForStaleCommit,
  waitForPendingReviewToFinish,
} from "./utils/review-process";
import {
  buildSummaryNote,
  trimReviewHistoryRuns,
} from "./utils/review-summary";
import { getFormattedVersion } from "./utils/version";

const main = async () => {
  const errors: string[] = [];
  let reviewingMarkerNoteId: number | null = null;
  let tempDir: string | null = null;

  if (argv["debug"]) {
    logger.info(
      "[DEBUG MODE] Starting review in debug mode - will generate mock reviews",
    );
    logger.info("[Arguments]", JSON.stringify(argv, null, 2));
  }

  logger.silent(`Gitlab Copilot CI`);
  logger.box(getFormattedVersion());

  if (!(await waitForPendingReviewToFinish())) {
    return;
  }

  // A. Fetch MR details and diff (SHA values needed for comment positioning)
  const mr = await gitlabService.getMergeRequest();

  if (
    shouldSkipForStaleCommit({ mergeRequestHeadSha: mr.diff_refs.head_sha })
  ) {
    return;
  }

  const reviewingMarkerNote = await gitlabService.createReviewingMarkerNote({
    noteBody: buildReviewingMarkerNoteBody({
      htmlMarkerPrefix: argv["html-marker-prefix"],
    }),
  });
  reviewingMarkerNoteId = reviewingMarkerNote.id;
  logger.info("[GitLab] Posted review-in-progress marker note");

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
        ? join(createdTempDir, "prior-inline-review-history.json")
        : null;

    if (reviewHistoryFilePath) {
      writeFileSync(
        reviewHistoryFilePath,
        JSON.stringify(historyItems, null, 2),
        "utf-8",
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
      debugMode: argv["debug"],
    });
    const response = await reviewRunner({
      prompt,
    });
    const normalizedResponse = normalizeReviewResponse({
      response,
      translationLangs: getPromptTranslationLangs({
        langs: argv["lang"],
        collapsedLangs: argv["collapsed-lang"],
      }),
    });
    const reviews = normalizedResponse.reviews;

    if (normalizedResponse.errors) errors.push(...normalizedResponse.errors);

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

    logger.success("Review results:");
    logger.log(JSON.stringify(normalizedResponse, null, 2));

    // C. Post inline review comments and store newly created review history entries
    const createdDiscussions: ReviewHistoryDiscussionEntity[] = [];
    const diffLineMatchState = new Map<string, number>();
    for (const item of reviews) {
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

        // logger.warn(
        //   `Failed to post comment for ${formatReviewLocation({ review: item })} at specified position. Attempted to recompute position from diff reference, result`,
        //   JSON.stringify({ recomputedReview, item }, null, 2),
        // );

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

    // D. Replace summary comment with updated embedded review history
    const summaryBody = buildSummaryNote({
      response: normalizedResponse,
      reviewHistory: trimReviewHistoryRuns({
        reviewHistory: [...reviewHistory, { discussions: createdDiscussions }],
      }),
      errors,
    });

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
