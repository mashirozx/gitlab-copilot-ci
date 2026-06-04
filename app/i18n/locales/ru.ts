import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ru = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Матрица использования модели и производительности",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Идёт ревью кода... Сейчас я проверяю коммит ${commitReference}. Чтобы избежать конфликтов, я приостановлю следующие ревью, пока текущее не завершится.`,
      manualDeleteHint:
        "Если процесс ревью выглядит зависшим, можно вручную удалить этот комментарий, чтобы снять блокировку. Но сначала проверьте состояние последнего review CI workflow: убедитесь, что он всё ещё выполняется, или перезапустите его при необходимости.",
      queueNotice: {
        zero: "За текущим ревью больше нет ожидающих ревью.",
        one: ({ count }: { count: number }) =>
          `За текущим ревью ожидает ещё ${count} ревью.`,
        other: ({ count }: { count: number }) =>
          `За текущим ревью ожидают ещё ${count} ревью.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
