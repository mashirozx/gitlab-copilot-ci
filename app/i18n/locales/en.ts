import { defineLocale } from "../schema";

export const en = defineLocale({
  reviewSummary: {
    performanceMetrics: {
      summary: "Model Usage & Performance Matrix",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Code review is in progress... I am reviewing commit ${commitReference}. To avoid conflicts, I will hold further reviews until the current one is concluded.`,
      manualDeleteHint:
        "Feel free to manually delete this comment if the review process seems stuck, which should unblock it. Just make sure to check the status of the latest review CI workflow first-ensure it's still running, or trigger a rerun if necessary.",
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
