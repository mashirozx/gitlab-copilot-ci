import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhHantLzh = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 ${readableModelName}程式碼評審總述`,
    walkthrough: {
      title: "📋 梗概",
    },
    changes: {
      title: "🚧 變更",
      columns: {
        layerFiles: "層 / 檔案",
        summary: "概述",
      },
    },
    reviewList: {
      title: "🔍 評審撮要",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `至提交${commitReference}之變更，未見行內評議：`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `至提交${commitReference}之變更，得行內評議${count}則：`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `至提交${commitReference}之變更，得行內評議${count}則：`,
      },
      footer: "<sub>前次評審之議，不錄於此。</sub>",
      empty: "✨ 未見問題！",
    },
    otherSuggestions: {
      title: "💡 餘議",
      empty: "✨ 無復議。",
    },
    details: {
      summary: "詳",
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
      summary: "📊 模型用度與效能矩陣",
    },
    criticalError: {
      message: "⚠ 審視流水失於重錯。請察 GitLab 作業，並重試此作業。",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ 審視流水失於重錯。請[**察流水詳情**](${linkToJobDetail})，並重試此作業。`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 程式碼評審方行……吾今審提交 ${commitReference}。為避衝突，當前評審未畢之前，後續評審且緩。`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `若 [**評審流程**](${linkToJobDetail}) 若滯，可手動刪此留言以解阻。然宜先察最近之 review CI workflow，確認其仍在運行，或於必要時重啟之。`,
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
