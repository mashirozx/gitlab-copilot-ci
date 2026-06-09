import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const fr = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Résumé de revue de code par ${readableModelName}`,
    walkthrough: {
      title: "📋 Parcours",
    },
    changes: {
      title: "🚧 Changements",
      columns: {
        layerFiles: "Couche / Fichier(s)",
        summary: "Résumé",
      },
    },
    reviewList: {
      title: "🔍 Résumé de revue",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Aucune suggestion de revue en ligne n'a été trouvée dans les changements jusqu'au commit ${commitReference} :`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `${count} suggestion de revue en ligne a été trouvée dans les changements jusqu'au commit ${commitReference} :`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `${count} suggestions de revue en ligne ont été trouvées dans les changements jusqu'au commit ${commitReference} :`,
      },
      footer:
        "<sub>Les suggestions des exécutions de revue précédentes ne sont pas listées ici.</sub>",
      empty: "✨ Aucun problème détecté !",
    },
    otherSuggestions: {
      title: "💡 Autres suggestions",
      empty: "✨ Je n'ai pas d'autre remarque.",
    },
    details: {
      summary: "Détails",
    },
    rank: {
      high: "ÉLEVÉ",
      medium: "MOYEN",
      low: "FAIBLE",
    },
    errors: {
      summary: "⚠️ Erreurs",
    },
    performanceMetrics: {
      summary: "📊 Matrice d'utilisation du modèle et des performances",
    },
    criticalError: {
      message:
        "⚠ Le pipeline de revue a echoue avec une erreur critique. Veuillez verifier le job GitLab et relancer ce job.",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ Le pipeline de revue a echoue avec une erreur critique. Veuillez [**consulter le detail du pipeline**](${linkToJobDetail}) et relancer ce job.`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ La revue de code est en cours... J'examine actuellement le commit ${commitReference}. Pour éviter les conflits, je suspends les revues suivantes jusqu'à la fin de celle-ci.`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `Si [**le processus de revue**](${linkToJobDetail}) semble bloqué, vous pouvez supprimer manuellement ce commentaire pour le débloquer. Vérifiez toutefois d'abord l'état du dernier workflow CI de revue afin de confirmer qu'il est toujours en cours ou qu'il faut le relancer.`,
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
