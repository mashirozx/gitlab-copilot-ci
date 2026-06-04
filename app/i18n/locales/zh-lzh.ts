import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhLzh = {
  reviewSummary: {
    performanceMetrics: {
      summary: "模型用度与效能矩阵",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 代码评审方行……吾今审提交 ${commitReference}。为避冲突，当前评审未毕之前，后续评审且缓。`,
      manualDeleteHint:
        "若评审流程若滞，可手动删此评论以解阻。然宜先察最近之 review CI workflow，确认其仍在运行，或于必要时重启之。",
      queueNotice: {
        zero: "当前评审之后，暂无其他评审待行。",
        one: ({ count }: { count: number }) =>
          `当前评审之后，尚有 ${count} 则评审待行。`,
        other: ({ count }: { count: number }) =>
          `当前评审之后，尚有 ${count} 则评审待行。`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
