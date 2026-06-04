import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ko = {
  reviewSummary: {
    performanceMetrics: {
      summary: "모델 사용량 및 성능 매트릭스",
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
