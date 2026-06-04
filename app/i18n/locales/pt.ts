import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const pt = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Matriz de Uso do Modelo e Desempenho",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ A revisão de código está em andamento... Estou revisando o commit ${commitReference}. Para evitar conflitos, vou segurar novas revisões até que a atual seja concluída.`,
      manualDeleteHint:
        "Se o processo de revisão parecer travado, você pode excluir manualmente este comentário para destravá-lo. Antes disso, confira o status do fluxo de CI de revisão mais recente para garantir que ele ainda esteja em execução ou acione uma nova execução, se necessário.",
      queueNotice: {
        zero: "Não há revisões adicionais aguardando atrás da revisão atual.",
        one: ({ count }: { count: number }) =>
          `Há ${count} revisão adicional aguardando atrás da revisão atual.`,
        other: ({ count }: { count: number }) =>
          `Há ${count} revisões adicionais aguardando atrás da revisão atual.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
