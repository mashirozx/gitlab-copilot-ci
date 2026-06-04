import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zh = {
  reviewSummary: {
    performanceMetrics: {
      summary: "模型用量与性能矩阵",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 代码审查进行中……我正在审查提交 ${commitReference}。为避免冲突，在当前审查结束之前，我会暂停后续审查。`,
      manualDeleteHint:
        "如果审查流程似乎卡住了，你可以手动删除这条评论来解除阻塞。但请先确认最新的审查 CI 工作流状态，确保它仍在运行，或在必要时重新触发一次。",
      queueNotice: {
        zero: "当前审查之后，没有其他审查在等待。",
        one: ({ count }: { count: number }) =>
          `当前审查之后，还有 ${count} 个审查在等待。`,
        other: ({ count }: { count: number }) =>
          `当前审查之后，还有 ${count} 个审查在等待。`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
