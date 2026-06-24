import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhHK = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 由 ${readableModelName} 產生的程式碼審查總結`,
    viewDetail: "查看詳情",
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
        }) => `✨ 在截至提交 ${commitReference} 的變更中未發現行內審查建議。`,
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
        "⚠ 審查流水線因嚴重錯誤而失敗。請檢查 GitLab 工作，並重試此工作。",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ 審查流水線因嚴重錯誤而失敗。請[**查看流水線詳情**](${linkToJobDetail})，並重試此工作。`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 程式碼審查進行中……我正在審查提交 ${commitReference}。為避免衝突，在目前審查完成前，我會暫停之後的審查。`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `如果 [**審查流程**](${linkToJobDetail}) 似乎卡住了，你可以手動刪除這條留言來解除阻塞。不過請先查看最新的審查 CI 工作流程狀態，確認它仍在運行，或在需要時重新觸發。`,
      queueNotice: {
        zero: "目前審查之後，沒有其他審查在等待。",
        one: ({ count }: { count: number }) =>
          `目前審查之後，尚有 ${count} 個審查在等待。`,
        other: ({ count }: { count: number }) =>
          `目前審查之後，尚有 ${count} 個審查在等待。`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
