import { defineLocale } from "../schema";

export const en = defineLocale({
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Code Review Summary by ${readableModelName}`,
    viewDetail: "View detail",
    walkthrough: {
      title: "📋 Walkthrough",
    },
    changes: {
      title: "🚧 Changes",
      columns: {
        layerFiles: "Layer / File(s)",
        summary: "Summary",
      },
    },
    reviewList: {
      title: "🔍 Review Summary",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `✨ No issues found in the changes up to commit ${commitReference}.`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Found ${count} inline review suggestion in the changes up to commit ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Found ${count} inline review suggestions in the changes up to commit ${commitReference}:`,
      },
      footer: "Suggestions from previous review runs are not listed here.",
    },
    otherSuggestions: {
      title: "💡 Other Suggestions",
      empty: "✨ I have no feedback to provide.",
    },
    details: {
      summary: "Details",
    },
    rank: {
      high: "HIGH",
      medium: "MEDIUM",
      low: "LOW",
    },
    errors: {
      summary: "⚠️ Errors",
    },
    performanceMetrics: {
      summary: "📊 Model Usage & Performance Matrix",
    },
    criticalError: {
      message:
        "⚠ The review pipeline failed with a critical error. Please check the pipeline job in GitLab and retry this job.",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ The review pipeline failed with a critical error. Please [**check the pipeline detail**](${linkToJobDetail}) and retry this job.`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Code review is in progress... I am reviewing commit ${commitReference}. To avoid conflicts, I will hold further reviews until the current one is concluded.`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `Feel free to manually delete this comment if [**the review process**](${linkToJobDetail}) seems stuck, which should unblock it. Just make sure to check the status of the latest review CI workflow first-ensure it's still running, or trigger a rerun if necessary.`,
      queueNotice: {
        zero: "No additional reviews are waiting behind the current one.",
        one: ({ count }: { count: number }) =>
          `There is ${count} additional review waiting behind the current one.`,
        other: ({ count }: { count: number }) =>
          `There are ${count} additional reviews waiting behind the current one.`,
      },
    },
  },
} as const);
