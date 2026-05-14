#!/usr/bin/env bun

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCopilotReview } from "./services/copilot";
import {
  getStoredReviewsForMR,
  storeReview,
  tryInitializeDatabase,
} from "./services/db";
import { gitlab } from "./services/gitlab";
import { logger } from "./services/logger";
import type { ReviewItem, StoredReview } from "./types/entities";
import { argv } from "./utils/argv";
import { getFormattedVersion } from "./utils/version";

const main = async () => {
  const projectId = argv["project-id"];
  const mrIid = parseInt(argv["mr-iid"], 10);
  const langs = argv["lang"];
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
  const db = tryInitializeDatabase(argv["db"], errors);

  // A. Fetch MR details and diff (SHA values needed for comment positioning)
  const mr = await gitlab.MergeRequests.show(projectId, mrIid);
  const changes = await gitlab.MergeRequests.allDiffs(projectId, mrIid);
  const tempDir = mkdtempSync(join(tmpdir(), "copilot-review-"));

  try {
    const diffFilePath = join(tempDir, "mr-diff.json");
    writeFileSync(diffFilePath, JSON.stringify(changes, null, 2), "utf-8");

    // Load previous reviews from database if available
    let previousReviews: StoredReview[] = [];
    if (db) {
      try {
        previousReviews = getStoredReviewsForMR({
          database: db,
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

    // B. Ask GitHub Copilot CLI to review the diff and read repo files as needed
    const response = await runCopilotReview({
      diffFilePath,
      title: mr.title,
      description: mr.description,
      previousReviews,
    });
    const reviews = Array.isArray(response.reviews) ? response.reviews : [];

    // Persist reviews to database if available
    if (db && reviews.length > 0) {
      try {
        for (const review of reviews) {
          const diffItem = changes.find(
            (change: { new_path: string }) =>
              change.new_path === review.file_path,
          );
          const sourceSnippet = diffItem?.diff ?? "";
          storeReview({
            database: db,
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

    // C. Find existing summary comment — extract previous discussion IDs from it, then delete it
    const mrNotes = await gitlab.MergeRequestNotes.all(projectId, mrIid);
    const existingSummaryNote = mrNotes.find(
      (note: { body: string; id: number }) =>
        note.body.includes(`<!-- ${argv["summary-marker"]} -->`),
    );

    type TrackedDiscussion = { id: string; file: string; line: number };
    let previousDiscussions: TrackedDiscussion[] = [];
    if (existingSummaryNote) {
      const dataMatch = (existingSummaryNote.body as string).match(
        new RegExp(`<!-- ${argv["review-data-tag"]}:(.*?) -->`),
      );
      if (dataMatch) {
        try {
          previousDiscussions =
            JSON.parse(dataMatch[1] ?? "null").discussions ?? [];
          logger.info(
            `Found ${previousDiscussions.length} previous review discussion(s) to check`,
          );
        } catch {
          logger.warn(
            "Failed to parse previous discussion data from summary comment",
          );
        }
      }

      try {
        await gitlab.MergeRequestNotes.remove(
          projectId,
          mrIid,
          existingSummaryNote.id,
        );
        logger.success("Deleted existing copilot review summary comment");
      } catch (e) {
        const msg = `Failed to delete existing summary comment: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.error(e);
        errors.push(msg);
      }
    }

    // D. Clean up unresolved copilot-review discussions tracked in previous summary
    for (const tracked of previousDiscussions) {
      try {
        const discussion = (
          await gitlab.MergeRequestDiscussions.all(projectId, mrIid)
        ).find(
          (d: {
            id: string;
            resolved?: boolean;
            outdated?: boolean;
            notes?: { id: number; body?: string; system?: boolean }[];
          }) => d.id === tracked.id,
        );
        if (!discussion || discussion.resolved) {
          continue;
        }

        const notes = (discussion.notes ?? []).filter(
          (n: { id: number; body?: string; system?: boolean }) => !n.system,
        );

        if (!notes[0]?.body?.includes(`<!-- ${argv["review-marker"]} -->`)) {
          continue;
        }

        const hasOtherReplies = notes.some(
          (n: { body?: string }) =>
            !n.body?.includes(`<!-- ${argv["review-marker"]} -->`),
        );

        if (hasOtherReplies) {
          await gitlab.MergeRequestDiscussions.resolve(
            projectId,
            mrIid,
            tracked.id,
            true,
          );
          logger.success(
            `Resolved discussion ${tracked.id} (${tracked.file}:${tracked.line}) — has replies from others`,
          );
        } else if (discussion.outdated) {
          await gitlab.MergeRequestDiscussions.resolve(
            projectId,
            mrIid,
            tracked.id,
            true,
          );
          logger.success(
            `Resolved discussion ${tracked.id} (${tracked.file}:${tracked.line}) — outdated discussion (cannot be fully deleted)`,
          );
        } else {
          for (const note of notes) {
            await gitlab.MergeRequestNotes.remove(projectId, mrIid, note.id);
          }
          logger.success(
            `Deleted discussion ${tracked.id} (${tracked.file}:${tracked.line})`,
          );
        }
      } catch (e) {
        const msg = `Failed to clean up discussion ${tracked.id}: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.error(e);
        errors.push(msg);
      }
    }

    // E. Post inline review comments, tracking created discussion IDs
    const createdDiscussions: TrackedDiscussion[] = [];
    for (const item of reviews) {
      try {
        const marker = `<!-- ${argv["review-marker"]} -->`;
        const translationLines = langs
          .map((lang) => item.translations?.[lang])
          .filter((t): t is string => !!t)
          .map((t) => `\n\n${t}`)
          .join("");
        const commentBody = `${marker}\n\n${item.suggestion}${translationLines}`;

        /**
         * IMPORTANT: Position object for GitLab MR discussions.
         *
         * Critical details that caused "line_code can't be blank" errors:
         * 1. startSha MUST equal baseSha (not diff_refs.start_sha).
         *    The start_sha in diff_refs is for a different comparison context
         *    and causes invalid line_code computation.
         * 2. oldLine MUST be omitted (not included) for newly added lines.
         *    Only include oldLine when the line actually exists in the old version.
         *    Omitting it allows GitLab API to properly compute the internal line_code.
         *
         * Reference: https://stackoverflow.com/a/65944171/8083009
         */
        const positionBase = {
          baseSha: mr.diff_refs.base_sha,
          headSha: mr.diff_refs.head_sha,
          startSha: mr.diff_refs.base_sha,
          positionType: "text" as const,
          newPath: item.file_path,
          oldPath: item.file_path,
          newLine: String(item.new_line),
        };

        const position = (item as ReviewItem).old_line
          ? { ...positionBase, oldLine: String((item as ReviewItem).old_line) }
          : positionBase;

        const discussion = await gitlab.MergeRequestDiscussions.create(
          projectId,
          mrIid,
          commentBody,
          { position },
        );
        createdDiscussions.push({
          id: discussion.id,
          file: item.file_path,
          line: item.new_line,
        });
        logger.success(
          `Successfully posted comment to ${item.file_path}:${item.new_line} (discussion: ${discussion.id})`,
        );
      } catch (e) {
        const msg = `Failed to post comment for ${item.file_path}:${item.new_line}: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.error(e);
        errors.push(msg);
      }
    }

    // F. Post summary comment with embedded tracking JSON
    const trackingJson = JSON.stringify({ discussions: createdDiscussions });
    let summaryBody = `<!-- ${argv["summary-marker"]} -->
<!-- ${argv["review-data-tag"]}:${trackingJson} -->
${response.comment}`;

    if (response.duration || response.model || response.context) {
      summaryBody += "\n\n---\n\n## 📊 Model Usage & Performance\n";

      if (response.model) {
        summaryBody += `- 🤖 **Model**: ${response.model}\n`;
      }

      if (response.duration) {
        const totalSeconds = Math.floor(response.duration / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const hms = [h && `${h}h`, m && `${m}m`, `${s}s`]
          .filter(Boolean)
          .join(" ");
        summaryBody += `- ⏱️ **Time taken**: ${hms} (${response.duration}ms)\n`;
      }

      if (response.context) {
        if (response.context.total_length) {
          summaryBody += `- 🌕 **Context window**: ${response.context.total_length}\n`;
        }
        if (response.context.used_length) {
          summaryBody += `- 🌑 **Context used**: ${response.context.used_length}\n`;
        }
        if (response.context.usage_percentage) {
          summaryBody += `- 🌓 **Context usage**: ${response.context.usage_percentage}%\n`;
        }
      }
    }

    if (errors.length > 0) {
      summaryBody += "\n\n<details>\n<summary>⚠️ Errors</summary>\n\n";
      for (const err of errors) {
        summaryBody += `- ${err}\n`;
      }
      summaryBody += "\n</details>";
    }

    try {
      await gitlab.MergeRequestNotes.create(projectId, mrIid, summaryBody);
      logger.success("Posted copilot review summary comment");
    } catch (e) {
      const msg = `Failed to post summary comment: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(msg);
      logger.error(e);
    }
  } finally {
    if (db) {
      try {
        db.close();
      } catch (e) {
        const msg = `[Database] Error closing database: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(msg);
        logger.error(e);
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((e) => logger.error(e));
