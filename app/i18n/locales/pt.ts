import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const pt = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Resumo da revisão de código por ${readableModelName}`,
    walkthrough: {
      title: "📋 Visão geral",
    },
    changes: {
      title: "🚧 Alterações",
      columns: {
        layerFiles: "Camada / Arquivo(s)",
        summary: "Resumo",
      },
    },
    reviewList: {
      title: "🔍 Resumo da revisão",
      header: {
        zero: "Nenhuma sugestão de revisão inline foi encontrada.",
        one: ({ count }: { count: number }) =>
          `${count} sugestão de revisão inline foi encontrada:`,
        other: ({ count }: { count: number }) =>
          `${count} sugestões de revisão inline foram encontradas:`,
      },
      footer:
        "<sub>As sugestões de execuções de revisão anteriores não são listadas aqui.</sub>",
      empty: "✨ Nenhum problema encontrado!",
    },
    otherSuggestions: {
      title: "💡 Outras sugestões",
      empty: "✨ Não tenho mais comentários para fornecer.",
    },
    details: {
      summary: "Detalhes",
    },
    rank: {
      high: "ALTO",
      medium: "MÉDIO",
      low: "BAIXO",
    },
    errors: {
      summary: "⚠️ Erros",
    },
    performanceMetrics: {
      summary: "📊 Matriz de Uso do Modelo e Desempenho",
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
