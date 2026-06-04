import { describe, expect, test } from "bun:test";
import { buildReviewHistoryFileContent } from "./review-history-file";

describe("buildReviewHistoryFileContent", () => {
  test("renders documented markdown review blocks without discussion metadata ids", () => {
    const content = buildReviewHistoryFileContent({
      historyItems: [
        {
          file_path: "app/main.ts",
          new_line: 42,
          old_line: null,
          suggestion: "Existing suggestion\n\n- keep rich markdown",
        },
      ],
    });

    expect(content).toContain(
      "# Prior Inline Review History For Duplicate Suppression",
    );
    expect(content).toContain(
      "Read this file only after you finish the actual code review and are about to build the final output JSON.",
    );
    expect(content).toContain("## Diff");
    expect(content).toContain("| File path | New line | Old line |");
    expect(content).toContain("| app/main.ts | 42 | - |");
    expect(content).toContain("## Suggestions");
    expect(content).toContain("Existing suggestion\n\n- keep rich markdown");
    expect(content).not.toContain("discussion_id");
    expect(content).not.toContain("note_id");
  });

  test("separates multiple reviews with a thematic break", () => {
    const content = buildReviewHistoryFileContent({
      historyItems: [
        {
          file_path: "app/main.ts",
          new_line: 42,
          old_line: null,
          suggestion: "First suggestion",
        },
        {
          file_path: "app/prompts.ts",
          new_line: null,
          old_line: 17,
          suggestion: "Second suggestion",
        },
      ],
    });

    expect(content).toContain("First suggestion\n\n***\n\n## Diff");
    expect(content).toContain("| app/prompts.ts | - | 17 |");
  });
});
