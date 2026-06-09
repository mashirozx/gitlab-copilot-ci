import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhTW = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 由 ${readableModelName} 產生的程式碼審查總結`,
    walkthrough: {
      title: "📋 變更概覽",
    },
    changes: {
      title: "🚧 變更",
      columns: {
        layerFiles: "層 / 檔案",
        summary: "摘要",
      },
    },
    reviewList: {
      title: "🔍 審查摘要",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `在截至提交 ${commitReference} 的變更中未發現行內審查建議：`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `在截至提交 ${commitReference} 的變更中發現 ${count} 條行內審查建議：`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `在截至提交 ${commitReference} 的變更中發現 ${count} 條行內審查建議：`,
      },
      footer: "<sub>此處不包含過往審查輪次中的建議。</sub>",
      empty: "✨ 未發現問題！",
    },
    otherSuggestions: {
      title: "💡 其他建議",
      empty: "✨ 我沒有額外回饋。",
    },
    details: {
      summary: "詳情",
    },
    rank: {
      high: "高",
      medium: "中",
      low: "低",
    },
    errors: {
      summary: "⚠️ 錯誤",
    },
    performanceMetrics: {
      summary: "📊 模型用量與效能矩陣",
    },
    criticalError: {
      message:
        "⚠ 審查流水線因嚴重錯誤而失敗。請檢查 GitLab 作業，或重新執行流水線。",
      messageWithLinks: ({
        linkToJobDetail,
        linkToJobRetry,
      }: {
        linkToJobDetail: string;
        linkToJobRetry: string;
      }) =>
        `⚠ 審查流水線因嚴重錯誤而失敗。請[**查看流水線詳情**](${linkToJobDetail})，或[**重試流水線**](${linkToJobRetry})。`,
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
