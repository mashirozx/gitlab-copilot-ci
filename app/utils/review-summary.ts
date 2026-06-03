import { spawnSync } from "node:child_process";
import type { ReviewHistoryRunEntity } from "../services/gitlab.types";
import type {
  ReviewResponseEntity,
  ReviewSummaryEntity,
} from "../types/review.types";
import { argv } from "./argv";
import { env } from "./env";
import { modelDisplayName } from "./model-display.ts";
import {
  buildDetailsBlock,
  formatCollapsedLanguageHeader,
  getDisplayLanguages,
  isEnglishLanguage,
} from "./review-output";

const getSummaryContentForLanguage = ({
  summary,
  language,
}: {
  summary: ReviewSummaryEntity;
  language: string;
}): string | null => {
  if (isEnglishLanguage({ language })) {
    return summary.content.trim().length > 0 ? summary.content : null;
  }

  const translationEntry = Object.entries(summary.translations ?? {}).find(
    ([lang]) => lang.trim().toLowerCase() === language.trim().toLowerCase(),
  );
  const translation = translationEntry?.[1];

  return translation && translation.trim().length > 0 ? translation : null;
};

export const renderSummaryComment = ({
  summary,
  displayLanguages,
  collapsedLanguages,
}: {
  summary: ReviewSummaryEntity;
  displayLanguages: string[];
  collapsedLanguages: string[];
}): string => {
  const collapsedLanguageSet = new Set(
    collapsedLanguages.map((language) => language.trim().toLowerCase()),
  );

  return displayLanguages
    .flatMap((language) => {
      const block = getSummaryContentForLanguage({
        summary,
        language,
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
    .join("\n\n---\n\n");
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

  if (response.usage?.totalTokens !== undefined) {
    content += `- 🔢 **Total tokens**: ${response.usage.totalTokens}\n`;
  }

  if (response.usage?.cost?.total !== undefined) {
    content += `- 💸 **Total cost**: ${response.usage.cost.total}\n`;
  }

  return `\n\n---\n\n${buildDetailsBlock({
    summary: "📊 Model Usage & Performance Matrix",
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
    summary: "⚠️ Errors",
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
}: {
  response: ReviewResponseEntity;
  reviewHistory: ReviewHistoryRunEntity[];
  errors: string[];
}): string => {
  const markerPrefix = argv["html-marker-prefix"];
  const summaryMarker = `${markerPrefix}-summary-marker`;
  const reviewDataStartTag = `${markerPrefix}-review-data-start`;
  const reviewDataEndTag = `${markerPrefix}-review-data-end`;
  const displayLanguages = getDisplayLanguages({
    langs: argv["lang"],
    collapsedLangs: argv["collapsed-lang"],
  });
  const encodedReviewHistory = encodeReviewHistory({
    reviewHistory: trimReviewHistoryRuns({
      reviewHistory,
    }),
  });

  let summaryBody = `<!-- ${summaryMarker} -->
${renderSummaryComment({
  summary: response.summary,
  displayLanguages,
  collapsedLanguages: argv["collapsed-lang"],
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
