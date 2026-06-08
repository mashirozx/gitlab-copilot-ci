import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ko = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 ${readableModelName}의 코드 리뷰 요약`,
    walkthrough: {
      title: "📋 개요",
    },
    changes: {
      title: "🚧 변경 사항",
      columns: {
        layerFiles: "레이어 / 파일",
        summary: "요약",
      },
    },
    reviewList: {
      title: "🔍 리뷰 요약",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `커밋 ${commitReference}까지의 변경에서 인라인 리뷰 제안을 찾지 못했습니다:`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `커밋 ${commitReference}까지의 변경에서 인라인 리뷰 제안 ${count}개를 찾았습니다:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `커밋 ${commitReference}까지의 변경에서 인라인 리뷰 제안 ${count}개를 찾았습니다:`,
      },
      footer: "<sub>이전 리뷰 실행의 제안은 여기에 포함되지 않습니다.</sub>",
      empty: "✨ 문제가 발견되지 않았습니다!",
    },
    otherSuggestions: {
      title: "💡 기타 제안",
      empty: "✨ 추가로 드릴 피드백이 없습니다.",
    },
    details: {
      summary: "세부 정보",
    },
    rank: {
      high: "높음",
      medium: "중간",
      low: "낮음",
    },
    errors: {
      summary: "⚠️ 오류",
    },
    performanceMetrics: {
      summary: "📊 모델 사용량 및 성능 매트릭스",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ 코드 리뷰를 진행 중입니다... 현재 커밋 ${commitReference} 을(를) 검토하고 있습니다. 충돌을 피하기 위해 현재 리뷰가 끝날 때까지 후속 리뷰를 보류합니다.`,
      manualDeleteHint:
        "리뷰 프로세스가 멈춘 것처럼 보이면 이 댓글을 수동으로 삭제해 차단을 해제할 수 있습니다. 다만 먼저 최신 리뷰 CI 워크플로 상태를 확인해서 아직 실행 중인지, 또는 다시 실행해야 하는지 확인하세요.",
      queueNotice: {
        zero: "현재 리뷰 뒤에서 대기 중인 추가 리뷰가 없습니다.",
        one: ({ count }: { count: number }) =>
          `현재 리뷰 뒤에서 추가 리뷰 ${count}건이 대기 중입니다.`,
        other: ({ count }: { count: number }) =>
          `현재 리뷰 뒤에서 추가 리뷰 ${count}건이 대기 중입니다.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
