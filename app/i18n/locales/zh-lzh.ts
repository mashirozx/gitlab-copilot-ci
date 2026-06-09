import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const zhLzh = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 ${readableModelName}代码评审总述`,
    walkthrough: {
      title: "📋 梗概",
    },
    changes: {
      title: "🚧 变更",
      columns: {
        layerFiles: "层 / 文件",
        summary: "概述",
      },
    },
    reviewList: {
      title: "🔍 评审撮要",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `至提交${commitReference}之变更，未见行内评议：`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `至提交${commitReference}之变更，得行内评议${count}则：`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) => `至提交${commitReference}之变更，得行内评议${count}则：`,
      },
      footer: "<sub>前次评审之议，不录于此。</sub>",
      empty: "✨ 未见问题！",
    },
    otherSuggestions: {
      title: "💡 余议",
      empty: "✨ 无复议。",
    },
    details: {
      summary: "详",
    },
    rank: {
      high: "高",
      medium: "中",
      low: "低",
    },
    errors: {
      summary: "⚠️ 错误",
    },
    performanceMetrics: {
      summary: "📊 模型用度与效能矩阵",
    },
    criticalError: {
      message: "⚠ 审视流水失于重错。请察 GitLab 作业，或更行流水。",
      messageWithLinks: ({
        linkToJobDetail,
        linkToJobRetry,
      }: {
        linkToJobDetail: string;
        linkToJobRetry: string;
      }) =>
        `⚠ 审视流水失于重错。请[**察流水详情**](${linkToJobDetail})，或[**重试流水**](${linkToJobRetry})。`,
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
