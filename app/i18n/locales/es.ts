import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const es = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Resumen de revisión de código por ${readableModelName}`,
    walkthrough: {
      title: "📋 Recorrido",
    },
    changes: {
      title: "🚧 Cambios",
      columns: {
        layerFiles: "Capa / Archivo(s)",
        summary: "Resumen",
      },
    },
    reviewList: {
      title: "🔍 Resumen de revisión",
      header: {
        zero: "No se encontraron sugerencias de revisión en línea.",
        one: ({ count }: { count: number }) =>
          `Se encontró ${count} sugerencia de revisión en línea:`,
        other: ({ count }: { count: number }) =>
          `Se encontraron ${count} sugerencias de revisión en línea:`,
      },
      footer:
        "<sub>Las sugerencias de ejecuciones de revisión anteriores no se enumeran aquí.</sub>",
      empty: "✨ ¡No se encontraron problemas!",
    },
    otherSuggestions: {
      title: "💡 Otras sugerencias",
      empty: "✨ No tengo comentarios adicionales.",
    },
    details: {
      summary: "Detalles",
    },
    rank: {
      high: "ALTO",
      medium: "MEDIO",
      low: "BAJO",
    },
    errors: {
      summary: "⚠️ Errores",
    },
    performanceMetrics: {
      summary: "📊 Matriz de Uso del Modelo y Rendimiento",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ La revisión de código está en curso... Estoy revisando el commit ${commitReference}. Para evitar conflictos, mantendré en espera las revisiones posteriores hasta que termine la actual.`,
      manualDeleteHint:
        "Si el proceso de revisión parece atascado, puedes eliminar manualmente este comentario para desbloquearlo. Antes de hacerlo, comprueba el estado del flujo de CI de revisión más reciente para asegurarte de que sigue ejecutándose o vuelve a lanzarlo si hace falta.",
      queueNotice: {
        zero: "No hay revisiones adicionales esperando detrás de la revisión actual.",
        one: ({ count }: { count: number }) =>
          `Hay ${count} revisión adicional esperando detrás de la revisión actual.`,
        other: ({ count }: { count: number }) =>
          `Hay ${count} revisiones adicionales esperando detrás de la revisión actual.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
