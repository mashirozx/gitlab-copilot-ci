import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ru = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Сводка ревью кода от ${readableModelName}`,
    walkthrough: {
      title: "📋 Обзор",
    },
    changes: {
      title: "🚧 Изменения",
      columns: {
        layerFiles: "Слой / Файл(ы)",
        summary: "Сводка",
      },
    },
    reviewList: {
      title: "🔍 Сводка ревью",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `В изменениях до коммита ${commitReference} встроенных замечаний ревью не найдено:`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Найдено ${count} встроенное замечание ревью в изменениях до коммита ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Найдено ${count} встроенных замечаний ревью в изменениях до коммита ${commitReference}:`,
      },
      footer:
        "<sub>Предложения из предыдущих запусков ревью здесь не перечислены.</sub>",
      empty: "✨ Проблем не найдено!",
    },
    otherSuggestions: {
      title: "💡 Другие предложения",
      empty: "✨ У меня нет дополнительных замечаний.",
    },
    details: {
      summary: "Подробности",
    },
    rank: {
      high: "ВЫСОКИЙ",
      medium: "СРЕДНИЙ",
      low: "НИЗКИЙ",
    },
    errors: {
      summary: "⚠️ Ошибки",
    },
    performanceMetrics: {
      summary: "📊 Матрица использования модели и производительности",
    },
    criticalError: {
      message:
        "⚠ Конвейер ревью завершился критической ошибкой. Проверьте задание GitLab или перезапустите конвейер.",
      messageWithLinks: ({
        linkToJobDetail,
        linkToJobRetry,
      }: {
        linkToJobDetail: string;
        linkToJobRetry: string;
      }) =>
        `⚠ Конвейер ревью завершился критической ошибкой. [**Проверьте детали конвейера**](${linkToJobDetail}) или [**повторите запуск конвейера**](${linkToJobRetry}).`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Идёт ревью кода... Сейчас я проверяю коммит ${commitReference}. Чтобы избежать конфликтов, я приостановлю следующие ревью, пока текущее не завершится.`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `Если [**процесс ревью**](${linkToJobDetail}) выглядит зависшим, можно вручную удалить этот комментарий, чтобы снять блокировку. Но сначала проверьте состояние последнего review CI workflow: убедитесь, что он всё ещё выполняется, или перезапустите его при необходимости.`,
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
