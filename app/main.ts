#!/usr/bin/env bun

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCopilotReview } from "./services/copilot";
import { databaseService } from "./services/db";
import { gitlabService } from "./services/gitlab";
import { logger } from "./services/logger";
import { runPiReview } from "./services/pi";
import type { StoredReview, TrackedDiscussion } from "./types/entities";
import { argv } from "./utils/argv";
import { findDiffItemByFilePath } from "./utils/review-helpers";
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
  const changes = await gitlabService.getMergeRequestDiffs();
  const tempDir = mkdtempSync(join(tmpdir(), "copilot-review-"));

  try {
    const diffFilePath = join(tempDir, "mr-diff.json");
    writeFileSync(diffFilePath, JSON.stringify(changes, null, 2), "utf-8");

    // Load previous reviews from database if available
    let previousReviews: StoredReview[] = [];
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

    logger.info(`[LLM] Using service: ${argv["llm-service"]}`);

    // B. Ask the configured LLM CLI to review the diff and read repo files as needed
    const reviewRunner =
      argv["llm-service"] === "pi" ? runPiReview : runCopilotReview;
    const response = await reviewRunner({
      diffFilePath,
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

    let previousDiscussions: TrackedDiscussion[] = [];
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
    const createdDiscussions: TrackedDiscussion[] = [];
    for (const item of reviews) {
      try {
        const discussion = await gitlabService.createReviewDiscussion({
          review: item,
          mergeRequest: mr,
        });
        createdDiscussions.push(discussion);
        logger.success(
          `Successfully posted comment to ${item.file_path}:${item.new_line} (discussion: ${discussion.id})`,
        );
      } catch (e) {
        const msg = `Failed to post comment for ${item.file_path}:${item.new_line}: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.debug(
          "Failed with payload :",
          JSON.stringify({ item, mr }, null, 2),
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
