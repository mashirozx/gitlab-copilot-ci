import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const es = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Matriz de Uso del Modelo y Rendimiento",
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
