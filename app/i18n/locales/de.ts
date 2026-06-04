import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const de = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Modellnutzung & Leistungsmatrix",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Die Code-Review läuft... Ich prüfe gerade den Commit ${commitReference}. Um Konflikte zu vermeiden, halte ich weitere Reviews zurück, bis die aktuelle abgeschlossen ist.`,
      manualDeleteHint:
        "Wenn der Review-Prozess festzustecken scheint, kannst du diesen Kommentar manuell löschen, um ihn freizugeben. Prüfe aber vorher den Status des neuesten Review-CI-Workflows und stelle sicher, dass er noch läuft oder bei Bedarf erneut gestartet werden sollte.",
      queueNotice: {
        zero: "Hinter der aktuellen Review warten keine weiteren Reviews.",
        one: ({ count }: { count: number }) =>
          `Hinter der aktuellen Review wartet noch ${count} weitere Review.`,
        other: ({ count }: { count: number }) =>
          `Hinter der aktuellen Review warten noch ${count} weitere Reviews.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
