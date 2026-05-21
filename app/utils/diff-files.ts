import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { MergeRequestDiffSchema } from "@gitbeaker/rest";
import { colorize } from "consola/utils";
import type { ReviewItem } from "../types/entities";

const getDiffHeaderPaths = ({
  diff,
}: {
  diff: MergeRequestDiffSchema;
}): {
  oldPathHeader: string;
  newPathHeader: string;
} => {
  return {
    oldPathHeader: diff.new_file ? "/dev/null" : `a/${diff.old_path}`,
    newPathHeader: diff.deleted_file ? "/dev/null" : `b/${diff.new_path}`,
  };
};

const getExtendedDiffHeaders = ({
  diff,
}: {
  diff: MergeRequestDiffSchema;
}): string[] => {
  if (diff.new_file) {
    return diff.b_mode ? [`new file mode ${diff.b_mode}`] : [];
  }

  if (diff.deleted_file) {
    return diff.a_mode ? [`deleted file mode ${diff.a_mode}`] : [];
  }

  const headers: string[] = [];

  if (diff.a_mode && diff.b_mode && diff.a_mode !== diff.b_mode) {
    headers.push(`old mode ${diff.a_mode}`, `new mode ${diff.b_mode}`);
  }

  if (diff.renamed_file && diff.old_path !== diff.new_path) {
    headers.push(`rename from ${diff.old_path}`, `rename to ${diff.new_path}`);
  }

  return headers;
};

const getGitLabMetadataLines = ({
  diff,
}: {
  diff: MergeRequestDiffSchema;
}): string[] => {
  const metadata = [
    `# gitlab-meta old_path=${diff.old_path}`,
    `# gitlab-meta new_path=${diff.new_path}`,
    `# gitlab-meta new_file=${String(diff.new_file)}`,
    `# gitlab-meta renamed_file=${String(diff.renamed_file)}`,
    `# gitlab-meta deleted_file=${String(diff.deleted_file)}`,
  ];

  if (diff.a_mode) {
    metadata.push(`# gitlab-meta a_mode=${diff.a_mode}`);
  }

  if (diff.b_mode) {
    metadata.push(`# gitlab-meta b_mode=${diff.b_mode}`);
  }

  return metadata;
};

export const buildDiffPageFileContent = ({
  diffs,
}: {
  diffs: MergeRequestDiffSchema[];
}): string => {
  return diffs
    .map((diff) => {
      const { oldPathHeader, newPathHeader } = getDiffHeaderPaths({ diff });
      const lines = [
        `diff --git a/${diff.old_path} b/${diff.new_path}`,
        ...getGitLabMetadataLines({ diff }),
        ...getExtendedDiffHeaders({ diff }),
        `--- ${oldPathHeader}`,
        `+++ ${newPathHeader}`,
      ];

      if (diff.diff) {
        lines.push(diff.diff);
      }

      return lines.join("\n");
    })
    .join("\n\n");
};

const resolveDiffFilePath = ({
  diffFile,
  diffFilePaths,
}: {
  diffFile?: string;
  diffFilePaths: string[];
}): string | null => {
  if (!diffFile) {
    return null;
  }

  return (
    diffFilePaths.find(
      (filePath) => filePath === diffFile || basename(filePath) === diffFile,
    ) ?? null
  );
};

const getDiffLineMatchStateKey = ({
  resolvedDiffFilePath,
  diffLineCode,
}: {
  resolvedDiffFilePath: string;
  diffLineCode: string;
}): string => {
  return `${resolvedDiffFilePath}\u0000${diffLineCode}`;
};

const findMatchingDiffLineIndex = ({
  diffLineCode,
  lines,
  matchState,
  resolvedDiffFilePath,
}: {
  diffLineCode: string;
  lines: string[];
  matchState?: Map<string, number>;
  resolvedDiffFilePath: string;
}): number | null => {
  const matchingIndexes = lines.reduce<number[]>((indexes, line, index) => {
    if (line === diffLineCode) {
      indexes.push(index);
    }

    return indexes;
  }, []);

  if (matchingIndexes.length === 0) {
    return null;
  }

  const matchStateKey = getDiffLineMatchStateKey({
    resolvedDiffFilePath,
    diffLineCode,
  });
  const previousMatchIndex = matchState?.get(matchStateKey);
  const nextMatchIndex =
    previousMatchIndex === undefined
      ? matchingIndexes[0]
      : (matchingIndexes.find((index) => index > previousMatchIndex) ??
        matchingIndexes[0]);

  if (nextMatchIndex === undefined) {
    return null;
  }

  matchState?.set(matchStateKey, nextMatchIndex);
  return nextMatchIndex;
};

export const recomputeReviewPositionFromDiffReference = ({
  review,
  diffFilePaths,
  matchState,
}: {
  review: ReviewItem;
  diffFilePaths: string[];
  matchState?: Map<string, number>;
}): ReviewItem | null => {
  if (!review.diff_line_code) {
    return null;
  }

  const resolvedDiffFilePath = resolveDiffFilePath({
    diffFile: review.diff_file,
    diffFilePaths,
  });

  if (!resolvedDiffFilePath) {
    return null;
  }

  const lines = readFileSync(resolvedDiffFilePath, "utf-8").split(/\r?\n/);
  const targetIndex = findMatchingDiffLineIndex({
    diffLineCode: review.diff_line_code,
    lines,
    matchState,
    resolvedDiffFilePath,
  });

  if (targetIndex === null || targetIndex < 0 || targetIndex >= lines.length) {
    return null;
  }

  let currentFilePath: string | null = null;
  let oldLine: number | null = null;
  let newLine: number | null = null;
  let inHunk = false;

  for (const [index, line] of lines.entries()) {
    const diffHeaderMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffHeaderMatch) {
      currentFilePath = diffHeaderMatch[2] ?? null;
      oldLine = null;
      newLine = null;
      inHunk = false;
    }

    const hunkHeaderMatch = line.match(
      /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/,
    );
    if (hunkHeaderMatch) {
      oldLine = Number.parseInt(hunkHeaderMatch[1] ?? "0", 10);
      newLine = Number.parseInt(hunkHeaderMatch[2] ?? "0", 10);
      inHunk = true;

      if (index === targetIndex) {
        return null;
      }

      continue;
    }

    if (!inHunk || oldLine === null || newLine === null) {
      continue;
    }

    if (index === targetIndex) {
      if (line.startsWith("+")) {
        return {
          ...review,
          file_path: currentFilePath ?? review.file_path,
          new_line: newLine,
          old_line: undefined,
        };
      }

      if (line.startsWith("-")) {
        return {
          ...review,
          file_path: currentFilePath ?? review.file_path,
          new_line: undefined,
          old_line: oldLine,
        };
      }

      if (line.startsWith(" ")) {
        return {
          ...review,
          file_path: currentFilePath ?? review.file_path,
          new_line: newLine,
          old_line: oldLine,
        };
      }

      return null;
    }

    if (line.startsWith("+")) {
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      oldLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return null;
};

export const colorizeDiffLineCode = (diffLineCode: string): string => {
  const color = (() => {
    if (diffLineCode.startsWith("+")) return "green";
    if (diffLineCode.startsWith("-")) return "red";
    return "yellow";
  })();
  return JSON.stringify(colorize(color, diffLineCode));
};
