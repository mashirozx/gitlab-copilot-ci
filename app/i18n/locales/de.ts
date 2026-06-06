import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const de = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Code-Review-Zusammenfassung von ${readableModelName}`,
    walkthrough: {
      title: "📋 Überblick",
    },
    changes: {
      title: "🚧 Änderungen",
      columns: {
        layerFiles: "Ebene / Datei(en)",
        summary: "Zusammenfassung",
      },
    },
    reviewList: {
      title: "🔍 Review-Zusammenfassung",
      header: {
        zero: "Es wurden keine Inline-Review-Hinweise gefunden.",
        one: ({ count }: { count: number }) =>
          `Es wurde ${count} Inline-Review-Hinweis gefunden:`,
        other: ({ count }: { count: number }) =>
          `Es wurden ${count} Inline-Review-Hinweise gefunden:`,
      },
      footer:
        "<sub>Vorschläge aus früheren Review-Läufen werden hier nicht aufgeführt.</sub>",
      empty: "✨ Keine Probleme gefunden!",
    },
    otherSuggestions: {
      title: "💡 Weitere Vorschläge",
      empty: "✨ Ich habe kein weiteres Feedback.",
    },
    details: {
      summary: "Details",
    },
    rank: {
      high: "HOCH",
      medium: "MITTEL",
      low: "NIEDRIG",
    },
    errors: {
      summary: "⚠️ Fehler",
    },
    performanceMetrics: {
      summary: "📊 Modellnutzung & Leistungsmatrix",
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
