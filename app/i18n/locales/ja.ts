import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ja = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 ${readableModelName} によるコードレビュー要約`,
    viewDetail: "詳細を見る",
    walkthrough: {
      title: "📋 ウォークスルー",
    },
    changes: {
      title: "🚧 変更点",
      columns: {
        layerFiles: "レイヤー / ファイル",
        summary: "概要",
      },
    },
    reviewList: {
      title: "🔍 レビュー要約",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `✨ コミット ${commitReference} までの変更では、インラインのレビュー指摘はありません。`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `コミット ${commitReference} までの変更で、インラインのレビュー指摘が ${count} 件あります:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `コミット ${commitReference} までの変更で、インラインのレビュー指摘が ${count} 件あります:`,
      },
      footer:
        "<sub>過去のレビュー実行で出された提案はここには含めていません。</sub>",
    },
    otherSuggestions: {
      title: "💡 その他の提案",
      empty: "✨ 追加のフィードバックはありません。",
    },
    details: {
      summary: "詳細",
    },
    rank: {
      high: "高",
      medium: "中",
      low: "低",
    },
    errors: {
      summary: "⚠️ エラー",
    },
    performanceMetrics: {
      summary: "📊 モデル使用量・パフォーマンス指標",
    },
    criticalError: {
      message:
        "⚠ レビュー用パイプラインで重大なエラーが発生しました。GitLab のジョブを確認し、このジョブを再試行してください。",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ レビュー用パイプラインで重大なエラーが発生しました。[**パイプライン詳細を確認**](${linkToJobDetail})し、このジョブを再試行してください。`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ コードレビューを実行中です... 現在コミット ${commitReference} をレビューしています。競合を避けるため、このレビューが完了するまで後続のレビューは保留します。`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        ` [**レビュー処理**](${linkToJobDetail}) が止まっているように見える場合は、このコメントを手動で削除してブロックを解除できます。ただし、その前に最新のレビュー CI ワークフローの状態を確認し、まだ実行中かどうか、または必要なら再実行すべきかを確認してください。`,
      queueNotice: {
        zero: "現在のレビューの後ろに、追加で待機しているレビューはありません。",
        one: ({ count }: { count: number }) =>
          `現在のレビューの後ろに、さらに ${count} 件のレビューが待機しています。`,
        other: ({ count }: { count: number }) =>
          `現在のレビューの後ろに、さらに ${count} 件のレビューが待機しています。`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
