#!/usr/bin/env bun

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCopilotReview } from "./services/copilot";
import { databaseService } from "./services/db";
import type { StoredReviewEntity } from "./services/db.types";
import { gitlabService } from "./services/gitlab";
import type { TrackedDiscussionEntity } from "./services/gitlab.types";
import { logger } from "./services/logger";
import { runPiReview } from "./services/pi";
import { argv } from "./utils/argv";
import {
  buildDiffPageFileContent,
  colorizeDiffLineCode,
  recomputeReviewPositionFromDiffReference,
} from "./utils/diff-files";
import {
  findDiffItemByFilePath,
  formatReviewLocation,
} from "./utils/review-helpers";
import { buildSummaryNote } from "./utils/review-summary";
import { getFormattedVersion } from "./utils/version";

const main = async () => {
  const mrIid = parseInt(argv["mr-iid"], 10);
  const errors: string[] = [];

  if (argv["debug"]) {
    logger.info(
      "[DEBUG MODE] Starting review in debug mode - will generate mock reviews",
    );
    logger.info("[Arguments]", JSON.stringify(argv, null, 2));
  }

  logger.silent(`Gitlab Copilot CI`);
  logger.box(getFormattedVersion());

  // Initialize database if path is provided
  databaseService.initialize({ errors });

  // A. Fetch MR details and diff (SHA values needed for comment positioning)
  const mr = await gitlabService.getMergeRequest();
  const {
    changes,
    pages: diffPages,
    errors: diffFetchErrors,
  } = await gitlabService.getMergeRequestDiffs();
  errors.push(...diffFetchErrors);
  const tempDir = mkdtempSync(join(tmpdir(), "copilot-review-"));

  try {
    const diffFilePaths = diffPages.map(({ page, diffs }) => {
      const diffFilePath = join(tempDir, `mr-diff.page-${page}.diff`);
      writeFileSync(diffFilePath, buildDiffPageFileContent({ diffs }), "utf-8");
      return diffFilePath;
    });

    logger.info(
      `[GitLab] Loaded ${changes.length} diff file entries across ${diffPages.length} page(s)`,
    );

    // Load previous reviews from database if available
    let previousReviews: StoredReviewEntity[] = [];
    if (databaseService.isEnabled()) {
      try {
        previousReviews = databaseService.getStoredReviewsForMR({
          mrIid: String(mrIid),
        });
        logger.info(
          `[Database] Loaded ${previousReviews.length} previous review(s) for MR ${mrIid}`,
        );
      } catch (e) {
        const msg = `[Database] Failed to load previous reviews: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.error(e);
        errors.push(msg);
      }
    }

    logger.info(`[LLM] Using service: ${argv["agent"]}`);

    // B. Ask the configured LLM CLI to review the diff and read repo files as needed
    const reviewRunner =
      argv["agent"] === "pi" ? runPiReview : runCopilotReview;
    const response = await reviewRunner({
      diffFilePaths,
      title: mr.title,
      description: mr.description,
      previousReviews,
    });
    const reviews = Array.isArray(response.reviews) ? response.reviews : [];

    // Persist reviews to database if available
    if (databaseService.isEnabled() && reviews.length > 0) {
      try {
        for (const review of reviews) {
          const diffItem = findDiffItemByFilePath({
            changes,
            filePath: review.file_path,
          });
          const sourceSnippet = diffItem?.diff ?? "";
          databaseService.storeReview({
            mrIid: String(mrIid),
            review,
            sourceSnippet,
          });
        }
        logger.info(
          `[Database] Persisted ${reviews.length} review(s) for MR ${mrIid}`,
        );
      } catch (e) {
        const msg = `[Database] Failed to persist reviews: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.error(e);
        errors.push(msg);
      }
    }

    if (response.errors) errors.push(...response.errors);

    logger.success("Review results:");
    logger.log(JSON.stringify(response, null, 2));

    // C. Find existing summary comment and extract previous discussion IDs from it
    const existingSummaryNote = await gitlabService.getExistingSummaryNote();

    let previousDiscussions: TrackedDiscussionEntity[] = [];
    if (existingSummaryNote) {
      previousDiscussions = gitlabService.getTrackedDiscussionsFromSummary({
        noteBody: existingSummaryNote.body,
      });
      logger.info(
        `Found ${previousDiscussions.length} previous review discussion(s) to check`,
      );
    }

    // D. Clean up unresolved copilot-review discussions tracked in previous summary
    let remainingPreviousDiscussions = previousDiscussions;
    try {
      const cleanupResult = await gitlabService.cleanupPreviousDiscussions({
        trackedDiscussions: previousDiscussions,
      });
      remainingPreviousDiscussions = cleanupResult.remainingDiscussions;
      errors.push(...cleanupResult.errors);

      for (const tracked of cleanupResult.processedDiscussions) {
        logger.success(
          `Processed previous discussion ${tracked.id} (${tracked.file}:${tracked.line})`,
        );
      }
    } catch (e) {
      const msg = `Failed to clean up previous discussions: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(msg);
      logger.error(e);
      errors.push(msg);
    }

    // E. Post inline review comments, tracking created discussion IDs
    const createdDiscussions: TrackedDiscussionEntity[] = [];
    const diffLineMatchState = new Map<string, number>();
    for (const item of reviews) {
      try {
        const discussion = await gitlabService.createReviewDiscussion({
          review: item,
          mergeRequest: mr,
        });
        createdDiscussions.push(discussion);
        logger.success(
          `Successfully posted comment to ${formatReviewLocation({ review: item })} (discussion: ${discussion.id})`,
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
              mergeRequest: mr,
            });
            createdDiscussions.push(discussion);
            logger.success(
              `Successfully posted comment to ${formatReviewLocation({ review: recomputedReview })} after recomputing position by using ${item.diff_file} to find${colorizeDiffLineCode(item.diff_line_code)} (discussion: ${discussion.id})`,
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

    // F. Post summary comment with embedded tracking JSON
    const trackingJson = JSON.stringify({
      discussions: [...remainingPreviousDiscussions, ...createdDiscussions],
    });
    const summaryBody = buildSummaryNote({
      response,
      trackingJson,
      errors,
    });

    try {
      if (existingSummaryNote) {
        await gitlabService.deleteSummaryNote({
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
    databaseService.close({ errors });
    rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }
};

main().catch((e) => logger.error(e));
