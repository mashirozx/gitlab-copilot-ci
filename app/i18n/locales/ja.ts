import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ja = {
  reviewSummary: {
    performanceMetrics: {
      summary: "モデル使用量・パフォーマンス指標",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ コードレビューを実行中です... 現在コミット ${commitReference} をレビューしています。競合を避けるため、このレビューが完了するまで後続のレビューは保留します。`,
      manualDeleteHint:
        "レビュー処理が止まっているように見える場合は、このコメントを手動で削除してブロックを解除できます。ただし、その前に最新のレビュー CI ワークフローの状態を確認し、まだ実行中かどうか、または必要なら再実行すべきかを確認してください。",
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
