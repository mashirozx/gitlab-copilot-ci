import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const fr = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Matrice d'utilisation du modèle et des performances",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ La revue de code est en cours... J'examine actuellement le commit ${commitReference}. Pour éviter les conflits, je suspends les revues suivantes jusqu'à la fin de celle-ci.`,
      manualDeleteHint:
        "Si le processus de revue semble bloqué, vous pouvez supprimer manuellement ce commentaire pour le débloquer. Vérifiez toutefois d'abord l'état du dernier workflow CI de revue afin de confirmer qu'il est toujours en cours ou qu'il faut le relancer.",
      queueNotice: {
        zero: "Aucune revue supplémentaire n'attend derrière la revue en cours.",
        one: ({ count }: { count: number }) =>
          `Il y a encore ${count} revue en attente derrière la revue en cours.`,
        other: ({ count }: { count: number }) =>
          `Il y a encore ${count} revues en attente derrière la revue en cours.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
