import { spawnSync } from "node:child_process";
import { t } from "../../i18n";
import type {
  ReviewHistoryDiscussionEntity,
  ReviewHistoryRunEntity,
} from "../../services/gitlab.types";
import type {
  ReviewChangeEntity,
  ReviewItemEntity,
  ReviewResponseEntity,
} from "../../types/review.types";
import { argv } from "../argv";
import { env } from "../env";
import { formatCollapsedLanguageHeader } from "../lang.ts";
import { modelDisplayName } from "../model-display.ts";
import {
  buildCurrentCommitReference,
  buildDetailsBlock,
  getLocalizedRecordValue,
  getRankInlineMath,
  normalizeReviewRank,
} from "./comment-helper";
import { getDisplayLanguages } from "./review-comment-builder";

const SUMMARY_DIVIDER = "\n\n---\n\n";
const MAX_LAYER_FILES_COLUMN_WIDTH = 56;

const getLocalizedSummaryValue = ({
  values,
  language,
}: {
  values: Record<string, string>;
  language: string;
}): string | null => {
  const value = getLocalizedRecordValue({
    record: values,
    language,
  });

  return value && value.trim().length > 0 ? value : null;
};

const buildInlineReviewNoteUrl = ({
  noteId,
}: {
  noteId: string;
}): string | null => {
  const projectUrl = env.CI_PROJECT_URL?.trim();
  const mergeRequestIid = String(
    argv["mr-iid"] ?? env.CI_MERGE_REQUEST_IID ?? "",
  ).trim();

  if (!projectUrl || !mergeRequestIid || !noteId.trim()) {
    return null;
  }

  return `${projectUrl}/-/merge_requests/${mergeRequestIid}#note_${noteId}`;
};

const isSameReviewLocation = ({
  left,
  right,
}: {
  left: Pick<ReviewItemEntity, "file_path" | "new_line" | "old_line">;
  right: Pick<
    ReviewHistoryDiscussionEntity["content"],
    "file_path" | "new_line" | "old_line"
  >;
}): boolean => {
  return (
    left.file_path === right.file_path &&
    (left.new_line ?? null) === (right.new_line ?? null) &&
    (left.old_line ?? null) === (right.old_line ?? null)
  );
};

const formatReviewLocationLabel = ({
  review,
}: {
  review: Pick<ReviewItemEntity, "file_path" | "new_line" | "old_line">;
}): string => {
  const line = review.new_line ?? review.old_line ?? "?";

  return `${review.file_path}:${line}`;
};

const formatLinkedReviewLocation = ({
  review,
  currentRunDiscussions,
}: {
  review: Pick<ReviewItemEntity, "file_path" | "new_line" | "old_line">;
  currentRunDiscussions: ReviewHistoryDiscussionEntity[];
}): string => {
  const locationLabel = formatReviewLocationLabel({ review });
  const matchedDiscussion = currentRunDiscussions.find((discussion) =>
    isSameReviewLocation({
      left: review,
      right: discussion.content,
    }),
  );

  if (!matchedDiscussion) {
    return `\`${locationLabel}\``;
  }

  const noteUrl = buildInlineReviewNoteUrl({
    noteId: matchedDiscussion.note_id,
  });

  if (!noteUrl) {
    return `\`${locationLabel}\``;
  }

  return `[\`${locationLabel}\`](${noteUrl})`;
};

const formatReviewLine = ({
  response,
  language,
  currentRunDiscussions,
}: {
  response: ReviewResponseEntity;
  language: string;
  currentRunDiscussions: ReviewHistoryDiscussionEntity[];
}): string => {
  if (response.reviews.length === 0) {
    return t("reviewSummary.reviewList.empty", { lang: language });
  }

  return response.reviews
    .flatMap((review) => {
      const localizedSuggestion = getLocalizedRecordValue({
        record: review.suggestions,
        language,
      });

      if (
        !localizedSuggestion ||
        localizedSuggestion.abstract.trim().length === 0
      ) {
        return [];
      }

      return [
        `${formatLinkedReviewLocation({ review, currentRunDiscussions })} ${getRankInlineMath({ rank: normalizeReviewRank({ rank: review.rank }), lang: language })} ${localizedSuggestion.abstract}`,
      ];
    })
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
};

const splitFileEntries = ({ filePath }: { filePath: string }): string[] => {
  return filePath
    .split(/(?:\s*[,;]\s*|\s+)/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const wrapFilePathLine = ({ filePath }: { filePath: string }): string[] => {
  if (filePath.length <= MAX_LAYER_FILES_COLUMN_WIDTH) {
    return [filePath];
  }

  const wrappedLines: string[] = [];
  const pathSegments = filePath.split("/");
  let currentLine = "";

  for (const pathSegment of pathSegments) {
    const nextLine =
      currentLine.length === 0 ? pathSegment : `${currentLine}/${pathSegment}`;

    if (nextLine.length <= MAX_LAYER_FILES_COLUMN_WIDTH) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }

    if (pathSegment.length <= MAX_LAYER_FILES_COLUMN_WIDTH) {
      currentLine = pathSegment;
      continue;
    }

    let remainingSegment = pathSegment;
    while (remainingSegment.length > MAX_LAYER_FILES_COLUMN_WIDTH) {
      wrappedLines.push(
        remainingSegment.slice(0, MAX_LAYER_FILES_COLUMN_WIDTH),
      );
      remainingSegment = remainingSegment.slice(MAX_LAYER_FILES_COLUMN_WIDTH);
    }
    currentLine = remainingSegment;
  }

  if (currentLine.length > 0) {
    wrappedLines.push(currentLine);
  }

  return wrappedLines;
};

const formatFilesCell = ({ files }: { files: string[] }): string => {
  return files
    .flatMap((filePath) => splitFileEntries({ filePath }))
    .flatMap((filePath) =>
      wrapFilePathLine({
        filePath,
      }).map((wrappedLine) => `\`${wrappedLine}\``),
    )
    .join("<br>");
};

const maybeCollapseSection = ({
  content,
  shouldCollapse,
  language,
}: {
  content: string;
  shouldCollapse: boolean;
  language: string;
}): string => {
  if (!shouldCollapse) {
    return content;
  }

  return buildDetailsBlock({
    summary: t("reviewSummary.details.summary", { lang: language }),
    content,
  });
};

const buildChangesTables = ({
  changes,
  language,
}: {
  changes: Array<Record<string, ReviewChangeEntity>>;
  language: string;
}): string => {
  return changes
    .flatMap((change) => {
      const localizedChange = getLocalizedRecordValue({
        record: change,
        language,
      });

      if (!localizedChange) {
        return [];
      }

      const rows = localizedChange.layers
        .map(
          (layer) =>
            `| **${layer.title}**${layer.files.length > 0 ? ` <br> ${formatFilesCell({ files: layer.files })}` : ""} | ${layer.summary} |`,
        )
        .join("\n");

      return [
        `**${localizedChange.step}**`,
        "",
        `| ${t("reviewSummary.changes.columns.layerFiles", { lang: language })} | ${t("reviewSummary.changes.columns.summary", { lang: language })} |`,
        "| --- | --- |",
        rows,
      ].join("\n");
    })
    .join("\n\n");
};

const buildSummaryLanguageBlock = ({
  response,
  language,
  hasPreviousReviewHistory,
  currentRunDiscussions,
}: {
  response: ReviewResponseEntity;
  language: string;
  hasPreviousReviewHistory: boolean;
  currentRunDiscussions: ReviewHistoryDiscussionEntity[];
}): string | null => {
  const walkthrough = getLocalizedSummaryValue({
    values: response.summary.walkthrough,
    language,
  });
  const otherSuggestions = getLocalizedSummaryValue({
    values: response.summary.otherSuggestions,
    language,
  });
  const changesTable = buildChangesTables({
    changes: response.summary.changes,
    language,
  });
  const readableModelName =
    response.readableModelName.trim().length > 0
      ? response.readableModelName
      : modelDisplayName;
  const commitReference = buildCurrentCommitReference();
  const changesSectionContent = maybeCollapseSection({
    content:
      changesTable.trim().length > 0
        ? changesTable
        : t("reviewSummary.otherSuggestions.empty", { lang: language }),
    shouldCollapse: argv["collapse-changes-summary"],
    language,
  });
  const reviewSummaryContent = [
    t("reviewSummary.reviewList.header", {
      count: response.reviews.length,
      commitReference,
      lang: language,
    }),
    formatReviewLine({
      response,
      language,
      currentRunDiscussions,
    }),
    hasPreviousReviewHistory
      ? ["***", t("reviewSummary.reviewList.footer", { lang: language })].join(
          "\n\n",
        )
      : null,
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
  const sections = [
    `# ${t("reviewSummary.title", { readableModelName, lang: language })}`,
    `## ${t("reviewSummary.walkthrough.title", { lang: language })}`,
    walkthrough ?? "",
    `## ${t("reviewSummary.changes.title", { lang: language })}`,
    changesSectionContent,
    `## ${t("reviewSummary.reviewList.title", { lang: language })}`,
    maybeCollapseSection({
      content: reviewSummaryContent,
      shouldCollapse: argv["collapse-review-summary"],
      language,
    }),
    `## ${t("reviewSummary.otherSuggestions.title", { lang: language })}`,
    otherSuggestions ??
      t("reviewSummary.otherSuggestions.empty", { lang: language }),
  ].filter((section) => section.trim().length > 0);

  return sections.join("\n\n");
};

export const renderSummaryComment = ({
  response,
  displayLanguages,
  collapsedLanguages,
  hasPreviousReviewHistory,
  currentRunDiscussions = [],
}: {
  response: ReviewResponseEntity;
  displayLanguages: string[];
  collapsedLanguages: string[];
  hasPreviousReviewHistory: boolean;
  currentRunDiscussions?: ReviewHistoryDiscussionEntity[];
}): string => {
  const collapsedLanguageSet = new Set(
    collapsedLanguages.map((language) => language.trim().toLowerCase()),
  );

  return displayLanguages
    .flatMap((language) => {
      const block = buildSummaryLanguageBlock({
        response,
        language,
        hasPreviousReviewHistory,
        currentRunDiscussions,
      });

      if (!block) {
        return [];
      }

      if (!collapsedLanguageSet.has(language.trim().toLowerCase())) {
        return [block];
      }

      return [
        buildDetailsBlock({
          summary: formatCollapsedLanguageHeader({ language }),
          content: block,
        }),
      ];
    })
    .join(SUMMARY_DIVIDER);
};

export const formatDurationAsHms = ({
  durationMs,
}: {
  durationMs: number;
}): string => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(" ");
};

const formatBytes = ({ bytes }: { bytes: number }): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

const formatCpuMicrosAsSeconds = ({
  cpuMicros,
}: {
  cpuMicros: number;
}): string => {
  return `${(cpuMicros / 1_000_000).toFixed(2)}s`;
};

export const getAgentDisplayLabel = ({
  agent = argv["agent"] as "github-copilot-cli" | "pi",
  getCommandOutput = ({
    command,
    args,
  }: {
    command: string;
    args: string[];
  }) => {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  },
}: {
  agent?: "github-copilot-cli" | "pi";
  getCommandOutput?: ({
    command,
    args,
  }: {
    command: string;
    args: string[];
  }) => string;
}): string => {
  const agentMeta =
    agent === "pi"
      ? {
          label: "Pi Coding Agent",
          command: argv["agent-bin"] ?? env.PI_BIN ?? "pi",
          versionArgs: ["--version"],
        }
      : {
          label: "GitHub Copilot CLI",
          command: argv["agent-bin"] ?? env.COPILOT_BIN ?? "copilot",
          versionArgs: ["-v"],
        };

  try {
    const rawOutput = getCommandOutput({
      command: agentMeta.command,
      args: agentMeta.versionArgs,
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (!rawOutput) {
      return agentMeta.label;
    }

    const versionMatch = rawOutput.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/i);

    if (!versionMatch) {
      return agentMeta.label;
    }

    return `${agentMeta.label} ${versionMatch[1]}`;
  } catch {
    return agentMeta.label;
  }
};

export const buildPerformanceMetricsSection = ({
  response,
  agentDisplay = getAgentDisplayLabel({}),
}: {
  response: ReviewResponseEntity;
  agentDisplay?: string;
}): string => {
  if (
    !response.duration &&
    !modelDisplayName &&
    !response.context &&
    !response.usage &&
    !response.runtimeStats &&
    !agentDisplay
  ) {
    return "";
  }

  let content = "";

  if (modelDisplayName) {
    content += `- 🤖 **Model**: ${modelDisplayName}\n`;
  }

  if (agentDisplay) {
    content += `- 🧰 **Agent**: ${agentDisplay}\n`;
  }

  if (response.duration) {
    content += `- ⏱️ **Time taken**: ${formatDurationAsHms({ durationMs: response.duration })} (${response.duration}ms)\n`;
  }

  if (response.runtimeStats?.platform) {
    content += `- 🖥️ **Runtime stats platform**: ${response.runtimeStats.platform}\n`;
  }

  if (response.runtimeStats?.parent.peakRssBytes !== undefined) {
    content += `- 🧠 **Parent peak RSS**: ${formatBytes({ bytes: response.runtimeStats.parent.peakRssBytes })}\n`;
  }

  if (response.runtimeStats?.parent.peakHeapUsedBytes !== undefined) {
    content += `- 🧱 **Parent peak heap**: ${formatBytes({ bytes: response.runtimeStats.parent.peakHeapUsedBytes })}\n`;
  }

  if (
    response.runtimeStats?.parent.cpuUserMicros !== undefined ||
    response.runtimeStats?.parent.cpuSystemMicros !== undefined
  ) {
    const cpuParts = [
      response.runtimeStats.parent.cpuUserMicros !== undefined
        ? `${formatCpuMicrosAsSeconds({ cpuMicros: response.runtimeStats.parent.cpuUserMicros })} user`
        : null,
      response.runtimeStats.parent.cpuSystemMicros !== undefined
        ? `${formatCpuMicrosAsSeconds({ cpuMicros: response.runtimeStats.parent.cpuSystemMicros })} system`
        : null,
    ].filter((part): part is string => part !== null);

    content += `- ⚙️ **Parent CPU time**: ${cpuParts.join(", ")}\n`;
  }

  if (response.runtimeStats?.agent.peakTreeRssBytes !== undefined) {
    content += `- 🌲 **Agent peak tree RSS**: ${formatBytes({ bytes: response.runtimeStats.agent.peakTreeRssBytes })}\n`;
  }

  if (response.runtimeStats?.agent.peakTreeCpuPercent !== undefined) {
    content += `- 🔥 **Agent peak tree CPU**: ${response.runtimeStats.agent.peakTreeCpuPercent}%\n`;
  }

  if (response.runtimeStats?.agent.peakProcessCount !== undefined) {
    content += `- 🧵 **Agent peak process count**: ${response.runtimeStats.agent.peakProcessCount}\n`;
  }

  if (response.runtimeStats?.agent.totalReadBytes !== undefined) {
    content += `- 📀 **Agent read bytes**: ${formatBytes({ bytes: response.runtimeStats.agent.totalReadBytes })}\n`;
  }

  if (response.runtimeStats?.agent.totalWriteBytes !== undefined) {
    content += `- 💾 **Agent write bytes**: ${formatBytes({ bytes: response.runtimeStats.agent.totalWriteBytes })}\n`;
  }

  if (response.runtimeStats?.capabilities.notes?.length) {
    content += `- ℹ️ **Runtime stats note**: ${response.runtimeStats.capabilities.notes.join(" ")}\n`;
  }

  if (response.context?.total_length !== undefined) {
    content += `- 🌕 **Context window**: ${response.context.total_length}\n`;
  }

  if (response.context?.used_length !== undefined) {
    content += `- 🌑 **Context used**: ${response.context.used_length}\n`;
  }

  if (response.context?.usage_percentage !== undefined) {
    content += `- 🌓 **Context usage**: ${response.context.usage_percentage}%\n`;
  }

  if (response.usage?.input !== undefined) {
    content += `- 📥 **Input tokens**: ${response.usage.input}\n`;
  }

  if (response.usage?.output !== undefined) {
    content += `- 📤 **Output tokens**: ${response.usage.output}\n`;
  }

  if (response.usage?.cacheRead !== undefined) {
    content += `- 📚 **Cache read tokens**: ${response.usage.cacheRead}\n`;
  }

  if (response.usage?.cacheWrite !== undefined) {
    content += `- ✍️ **Cache write tokens**: ${response.usage.cacheWrite}\n`;
  }

  if (response.usage?.aiCredits !== undefined) {
    content += `- 🪙 **AI Credits**: ${response.usage.aiCredits}\n`;
  }

  if (response.usage?.totalTokens !== undefined) {
    content += `- 🔢 **Total tokens**: ${response.usage.totalTokens}\n`;
  }

  if (response.usage?.reasoningTokens !== undefined) {
    content += `- 🧠 **Reasoning tokens**: ${response.usage.reasoningTokens}\n`;
  }

  if (response.usage?.cost?.total !== undefined) {
    content += `- 💸 **Total cost**: ${response.usage.cost.total}\n`;
  }

  return `\n\n---\n\n${buildDetailsBlock({
    summary: t("reviewSummary.performanceMetrics.summary"),
    content: content.trimEnd(),
  })}`;
};

export const buildErrorsSummarySection = ({
  errors,
}: {
  errors: string[];
}): string => {
  if (errors.length === 0) {
    return "";
  }

  const errorLines = errors.map((err) => `- ${err}`).join("\n");
  return `\n\n${buildDetailsBlock({
    summary: t("reviewSummary.errors.summary"),
    content: errorLines,
  })}`;
};

export const trimReviewHistoryRuns = ({
  reviewHistory,
  maxHistoryLength = argv["max-history-length"],
}: {
  reviewHistory: ReviewHistoryRunEntity[];
  maxHistoryLength?: number;
}): ReviewHistoryRunEntity[] => {
  if (
    maxHistoryLength === undefined ||
    reviewHistory.length <= maxHistoryLength
  ) {
    return reviewHistory;
  }

  return reviewHistory.slice(-maxHistoryLength);
};

export const encodeReviewHistory = ({
  reviewHistory,
}: {
  reviewHistory: ReviewHistoryRunEntity[];
}): string => {
  return Buffer.from(JSON.stringify(reviewHistory), "utf8").toString("base64");
};

export const buildSummaryNote = ({
  response,
  reviewHistory,
  errors,
  hasPreviousReviewHistory,
  currentRunDiscussions = [],
}: {
  response: ReviewResponseEntity;
  reviewHistory: ReviewHistoryRunEntity[];
  errors: string[];
  hasPreviousReviewHistory: boolean;
  currentRunDiscussions?: ReviewHistoryDiscussionEntity[];
}): string => {
  const markerPrefix = argv["html-marker-prefix"];
  const summaryMarker = `${markerPrefix}-summary-marker`;
  const reviewDataStartTag = `${markerPrefix}-review-data-start`;
  const reviewDataEndTag = `${markerPrefix}-review-data-end`;
  const displayLanguages = getDisplayLanguages({
    langs: argv["lang"],
    collapsedLangs: argv["collapsed-lang"],
    sourceLanguage: argv["thinking-lang"],
  });
  const encodedReviewHistory = encodeReviewHistory({
    reviewHistory: trimReviewHistoryRuns({
      reviewHistory,
    }),
  });

  let summaryBody = `<!-- ${summaryMarker} -->
${renderSummaryComment({
  response,
  displayLanguages,
  collapsedLanguages: argv["collapsed-lang"],
  hasPreviousReviewHistory,
  currentRunDiscussions,
})}`;

  summaryBody += buildPerformanceMetricsSection({
    response,
  });
  summaryBody += buildErrorsSummarySection({
    errors,
  });
  summaryBody += `\n\n<!-- ${reviewDataStartTag} -->\n<!--\n${encodedReviewHistory}\n-->\n<!-- ${reviewDataEndTag} -->`;

  return summaryBody;
};
