import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhTW = {
  reviewSummary: {
    performanceMetrics: {
      summary: "模型用量與效能矩陣",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 程式碼審查進行中……我正在審查提交 ${commitReference}。為避免衝突，在目前審查完成之前，我會暫停後續審查。`,
      manualDeleteHint:
        "如果審查流程看起來卡住了，你可以手動刪除這則留言來解除阻塞。但請先確認最新的審查 CI 工作流程狀態，確保它仍在執行，或在必要時重新觸發一次。",
      queueNotice: {
        zero: "目前審查之後，沒有其他審查在等待。",
        one: ({ count }: { count: number }) =>
          `目前審查之後，還有 ${count} 個審查在等待。`,
        other: ({ count }: { count: number }) =>
          `目前審查之後，還有 ${count} 個審查在等待。`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
