import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { MergeRequestDiffSchema } from "@gitbeaker/rest";
import {
  buildDiffPageFileContent,
  recomputeReviewPositionFromDiffReference,
} from "./diff-files";

const createDiff = ({
  oldPath,
  newPath,
  diff,
  newFile = false,
  deletedFile = false,
  renamedFile = false,
  aMode = "100644",
  bMode = "100644",
}: {
  oldPath: string;
  newPath: string;
  diff: string;
  newFile?: boolean;
  deletedFile?: boolean;
  renamedFile?: boolean;
  aMode?: string;
  bMode?: string;
}): MergeRequestDiffSchema => {
  return {
    a_mode: aMode,
    b_mode: bMode,
    old_path: oldPath,
    new_path: newPath,
    diff,
    new_file: newFile,
    deleted_file: deletedFile,
    renamed_file: renamedFile,
  };
};

const writeTempDiffFile = ({ content }: { content: string }): string => {
  const tempDir = mkdtempSync(join(tmpdir(), "diff-files-spec-"));
  const filePath = join(tempDir, "mr-diff.page-1.diff");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
};

describe("buildDiffPageFileContent", () => {
  test("renders gitlab metadata comments and standard extended diff headers", () => {
    const content = buildDiffPageFileContent({
      diffs: [
        createDiff({
          oldPath: "src/changed.ts",
          newPath: "src/changed.ts",
          diff: "@@ -1 +1 @@\n-old\n+new",
          aMode: "100644",
          bMode: "100755",
        }),
        createDiff({
          oldPath: "src/added.ts",
          newPath: "src/added.ts",
          diff: "@@ -0,0 +1 @@\n+created",
          newFile: true,
        }),
        createDiff({
          oldPath: "src/removed.ts",
          newPath: "src/removed.ts",
          diff: "@@ -1 +0,0 @@\n-gone",
          deletedFile: true,
        }),
        createDiff({
          oldPath: "src/old-name.ts",
          newPath: "src/new-name.ts",
          diff: "@@ -1 +1 @@\n-oldName\n+newName",
          renamedFile: true,
        }),
      ],
    });

    expect(content).toContain("diff --git a/src/changed.ts b/src/changed.ts");
    expect(content).toContain("# gitlab-meta old_path=src/changed.ts");
    expect(content).toContain("# gitlab-meta new_path=src/changed.ts");
    expect(content).toContain("# gitlab-meta new_file=false");
    expect(content).toContain("# gitlab-meta renamed_file=false");
    expect(content).toContain("# gitlab-meta deleted_file=false");
    expect(content).toContain("# gitlab-meta a_mode=100644");
    expect(content).toContain("# gitlab-meta b_mode=100755");
    expect(content).toContain("old mode 100644");
    expect(content).toContain("new mode 100755");
    expect(content).toContain("--- a/src/changed.ts");
    expect(content).toContain("+++ b/src/changed.ts");
    expect(content).toContain("new file mode 100644");
    expect(content).toContain("deleted file mode 100644");
    expect(content).toContain("# gitlab-meta renamed_file=true");
    expect(content).toContain("rename from src/old-name.ts");
    expect(content).toContain("rename to src/new-name.ts");
    expect(content).toContain("--- /dev/null");
    expect(content).toContain("+++ /dev/null");
  });
});

describe("recomputeReviewPositionFromDiffReference", () => {
  test("recomputes positions when metadata headers appear before hunks", () => {
    const diffFilePath = writeTempDiffFile({
      content: buildDiffPageFileContent({
        diffs: [
          createDiff({
            oldPath: "src/old-example.ts",
            newPath: "src/example.ts",
            diff: [
              "@@ -10,3 +10,4 @@",
              " lineA",
              "-lineB",
              "+lineB2",
              " lineC",
              "+lineD",
            ].join("\n"),
            renamedFile: true,
            aMode: "100644",
            bMode: "100755",
          }),
        ],
      }),
    });

    try {
      const addedReview = recomputeReviewPositionFromDiffReference({
        review: {
          file_path: "wrong/path.ts",
          diff_file: "mr-diff.page-1.diff",
          diff_line_code: "+lineB2",
          suggestion: "Use the added line",
        },
        diffFilePaths: [diffFilePath],
      });

      const removedReview = recomputeReviewPositionFromDiffReference({
        review: {
          file_path: "wrong/path.ts",
          diff_file: "mr-diff.page-1.diff",
          diff_line_code: "-lineB",
          suggestion: "Use the removed line",
        },
        diffFilePaths: [diffFilePath],
      });

      const contextReview = recomputeReviewPositionFromDiffReference({
        review: {
          file_path: "wrong/path.ts",
          diff_file: "mr-diff.page-1.diff",
          diff_line_code: " lineC",
          suggestion: "Use the context line",
        },
        diffFilePaths: [diffFilePath],
      });

      expect(addedReview).toEqual({
        file_path: "src/example.ts",
        diff_file: "mr-diff.page-1.diff",
        diff_line_code: "+lineB2",
        suggestion: "Use the added line",
        new_line: 11,
        old_line: undefined,
      });

      expect(removedReview).toEqual({
        file_path: "src/example.ts",
        diff_file: "mr-diff.page-1.diff",
        diff_line_code: "-lineB",
        suggestion: "Use the removed line",
        new_line: undefined,
        old_line: 11,
      });

      expect(contextReview).toEqual({
        file_path: "src/example.ts",
        diff_file: "mr-diff.page-1.diff",
        diff_line_code: " lineC",
        suggestion: "Use the context line",
        new_line: 12,
        old_line: 12,
      });
    } finally {
      rmSync(diffFilePath, { force: true });
      rmSync(dirname(diffFilePath), { force: true, recursive: true });
    }
  });

  test("returns null for invalid diff references", () => {
    const diffFilePath = writeTempDiffFile({
      content: buildDiffPageFileContent({
        diffs: [
          createDiff({
            oldPath: "src/example.ts",
            newPath: "src/example.ts",
            diff: "@@ -1 +1 @@\n-old\n+new",
          }),
        ],
      }),
    });

    try {
      expect(
        recomputeReviewPositionFromDiffReference({
          review: {
            file_path: "src/example.ts",
            diff_file: "missing.diff",
            diff_line_code: "+new",
            suggestion: "Missing file",
          },
          diffFilePaths: [diffFilePath],
        }),
      ).toBeNull();

      expect(
        recomputeReviewPositionFromDiffReference({
          review: {
            file_path: "src/example.ts",
            diff_file: "mr-diff.page-1.diff",
            diff_line_code: "+does-not-exist",
            suggestion: "Invalid diff line code",
          },
          diffFilePaths: [diffFilePath],
        }),
      ).toBeNull();
    } finally {
      rmSync(diffFilePath, { force: true });
      rmSync(dirname(diffFilePath), { force: true, recursive: true });
    }
  });

  test("uses later duplicate matches first, then wraps to earlier matches", () => {
    const diffFilePath = writeTempDiffFile({
      content: buildDiffPageFileContent({
        diffs: [
          createDiff({
            oldPath: "src/example.ts",
            newPath: "src/example.ts",
            diff: [
              "@@ -1,2 +1,4 @@",
              " lineA",
              "+duplicate()",
              " lineB",
              "+duplicate()",
            ].join("\n"),
          }),
        ],
      }),
    });

    try {
      const matchState = new Map<string, number>();

      const firstReview = recomputeReviewPositionFromDiffReference({
        review: {
          file_path: "wrong/path.ts",
          diff_file: "mr-diff.page-1.diff",
          diff_line_code: "+duplicate()",
          suggestion: "First duplicate",
        },
        diffFilePaths: [diffFilePath],
        matchState,
      });

      const secondReview = recomputeReviewPositionFromDiffReference({
        review: {
          file_path: "wrong/path.ts",
          diff_file: "mr-diff.page-1.diff",
          diff_line_code: "+duplicate()",
          suggestion: "Second duplicate",
        },
        diffFilePaths: [diffFilePath],
        matchState,
      });

      const thirdReview = recomputeReviewPositionFromDiffReference({
        review: {
          file_path: "wrong/path.ts",
          diff_file: "mr-diff.page-1.diff",
          diff_line_code: "+duplicate()",
          suggestion: "Wrapped duplicate",
        },
        diffFilePaths: [diffFilePath],
        matchState,
      });

      expect(firstReview).toEqual({
        file_path: "src/example.ts",
        diff_file: "mr-diff.page-1.diff",
        diff_line_code: "+duplicate()",
        suggestion: "First duplicate",
        new_line: 2,
        old_line: undefined,
      });

      expect(secondReview).toEqual({
        file_path: "src/example.ts",
        diff_file: "mr-diff.page-1.diff",
        diff_line_code: "+duplicate()",
        suggestion: "Second duplicate",
        new_line: 4,
        old_line: undefined,
      });

      expect(thirdReview).toEqual({
        file_path: "src/example.ts",
        diff_file: "mr-diff.page-1.diff",
        diff_line_code: "+duplicate()",
        suggestion: "Wrapped duplicate",
        new_line: 2,
        old_line: undefined,
      });
    } finally {
      rmSync(diffFilePath, { force: true });
      rmSync(dirname(diffFilePath), { force: true, recursive: true });
    }
  });
});
