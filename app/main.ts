#!/usr/bin/env bun

import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCopilotReview } from "./services/copilot";
import {
  getStoredReviewsForMR,
  initializeDatabase,
  storeReview,
} from "./services/db";
import { gitlab } from "./services/gitlab";
import {
  initializeLogger,
  logError,
  logInfo,
  logWarn,
} from "./services/logger";
import type { ReviewItem, StoredReview } from "./types/entities";
import { argv } from "./utils/argv";

const main = async () => {
  const projectId = argv["project-id"] as string;
  const mrIid = parseInt(argv["mr-iid"] as string, 10);
  const langs = (argv["lang"] as string[]) ?? [];
  const errors: string[] = [];

  const logArg = argv["log"];
  if (logArg !== undefined && logArg !== "false") {
    const logDir =
      typeof logArg === "string" && logArg !== "true" ? logArg : undefined;
    initializeLogger(logDir);
  }

  if (argv["debug"]) {
    logInfo(
      "[DEBUG MODE] Starting review in debug mode - will generate mock reviews",
    );
  }

  logInfo(`[Start] Gitlab Copilot CI`);
  logInfo("[Arguments]", argv);

  // Initialize database if path is provided
  let db: Database | null = null;
  if (argv["db"]) {
    try {
      db = initializeDatabase(argv["db"] as string);
      logInfo(`[Database] Initialized SQLite at ${argv["db"]}`);
    } catch (e) {
      const msg = `Failed to initialize database: ${(e as Error).message}`;
      logError("[Database]", msg);
      errors.push(msg);
    }
  }

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
        logInfo(
          `[Database] Loaded ${previousReviews.length} previous review(s) for MR ${mrIid}`,
        );
      } catch (e) {
        const msg = `Failed to load previous reviews: ${(e as Error).message}`;
        logError("[Database]", msg);
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
        logInfo(
          `[Database] Persisted ${reviews.length} review(s) for MR ${mrIid}`,
        );
      } catch (e) {
        const msg = `Failed to persist reviews: ${(e as Error).message}`;
        logError("[Database]", msg);
        errors.push(msg);
      }
    }

    if (response.errors) errors.push(...response.errors);

    logInfo("Review results:");
    logInfo(JSON.stringify(response, null, 2));

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
          logInfo(
            `Found ${previousDiscussions.length} previous review discussion(s) to check`,
          );
        } catch {
          logWarn(
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
        logInfo("Deleted existing copilot review summary comment");
      } catch (e) {
        const msg = `Failed to delete existing summary comment: ${(e as Error).message}`;
        logError(msg);
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
          logInfo(
            `Resolved discussion ${tracked.id} (${tracked.file}:${tracked.line}) — has replies from others`,
          );
        } else if (discussion.outdated) {
          await gitlab.MergeRequestDiscussions.resolve(
            projectId,
            mrIid,
            tracked.id,
            true,
          );
          logInfo(
            `Resolved discussion ${tracked.id} (${tracked.file}:${tracked.line}) — outdated discussion (cannot be fully deleted)`,
          );
        } else {
          for (const note of notes) {
            await gitlab.MergeRequestNotes.remove(projectId, mrIid, note.id);
          }
          logInfo(
            `Deleted discussion ${tracked.id} (${tracked.file}:${tracked.line})`,
          );
        }
      } catch (e) {
        const msg = `Failed to clean up discussion ${tracked.id}: ${(e as Error).message}`;
        logError(msg);
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

        const position = {
          baseSha: mr.diff_refs.base_sha,
          headSha: mr.diff_refs.head_sha,
          startSha: mr.diff_refs.start_sha,
          positionType: "text" as const,
          newPath: item.file_path,
          oldPath: item.file_path,
          newLine: String(item.new_line),
          oldLine: String((item as ReviewItem).old_line ?? item.new_line),
        };

        logInfo(
          `[Discussion] Creating discussion for ${item.file_path}:${item.new_line}`,
        );
        logInfo(
          `[Discussion] Position params:`,
          JSON.stringify(position, null, 2),
        );
        logInfo(
          `[Discussion] MR diff_refs:`,
          JSON.stringify(mr.diff_refs, null, 2),
        );

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
        logInfo(
          `Successfully posted comment to ${item.file_path}:${item.new_line} (discussion: ${discussion.id})`,
        );
      } catch (e) {
        const msg = `Failed to post comment for ${item.file_path}:${item.new_line}: ${(e as Error).message}`;
        logError(msg);
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
      logInfo("Posted copilot review summary comment");
    } catch (e) {
      logError(`Failed to post summary comment: ${(e as Error).message}`);
    }
  } finally {
    if (db) {
      try {
        db.close();
      } catch (e) {
        logError("[Database] Error closing database:", (e as Error).message);
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch(logError);
