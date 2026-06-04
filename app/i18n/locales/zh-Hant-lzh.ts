import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhHantLzh = {
  reviewSummary: {
    performanceMetrics: {
      summary: "模型用度與效能矩陣",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 程式碼評審方行……吾今審提交 ${commitReference}。為避衝突，當前評審未畢之前，後續評審且緩。`,
      manualDeleteHint:
        "若評審流程若滯，可手動刪此留言以解阻。然宜先察最近之 review CI workflow，確認其仍在運行，或於必要時重啟之。",
      queueNotice: {
        zero: "當前評審之後，暫無其他評審待行。",
        one: ({ count }: { count: number }) =>
          `當前評審之後，尚有 ${count} 則評審待行。`,
        other: ({ count }: { count: number }) =>
          `當前評審之後，尚有 ${count} 則評審待行。`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
