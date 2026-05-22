import type { ReviewResponseEntity } from "../services/review.types";
import { argv } from "./argv";

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

export const buildPerformanceMetricsSection = ({
  response,
}: {
  response: ReviewResponseEntity;
}): string => {
  if (!response.duration && !response.model && !response.context) {
    return "";
  }

  let section = "\n\n---\n\n## 📊 Model Usage & Performance\n";

  if (response.model) {
    section += `- 🤖 **Model**: ${response.model}\n`;
  }

  if (response.duration) {
    section += `- ⏱️ **Time taken**: ${formatDurationAsHms({ durationMs: response.duration })} (${response.duration}ms)\n`;
  }

  if (response.context?.total_length) {
    section += `- 🌕 **Context window**: ${response.context.total_length}\n`;
  }

  if (response.context?.used_length) {
    section += `- 🌑 **Context used**: ${response.context.used_length}\n`;
  }

  if (response.context?.usage_percentage) {
    section += `- 🌓 **Context usage**: ${response.context.usage_percentage}%\n`;
  }

  return section;
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
  return `\n\n<details>\n<summary>⚠️ Errors</summary>\n\n${errorLines}\n\n</details>`;
};

export const buildSummaryNote = ({
  response,
  trackingJson,
  errors,
}: {
  response: ReviewResponseEntity;
  trackingJson: string;
  errors: string[];
}): string => {
  let summaryBody = `<!-- ${argv["summary-marker"]} -->
<!-- ${argv["review-data-tag"]}:${trackingJson} -->
${response.comment}`;

  summaryBody += buildPerformanceMetricsSection({
    response,
  });
  summaryBody += buildErrorsSummarySection({
    errors,
  });

  return summaryBody;
};
