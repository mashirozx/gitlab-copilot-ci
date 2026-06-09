import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const it = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Riepilogo della revisione del codice di ${readableModelName}`,
    walkthrough: {
      title: "📋 Panoramica",
    },
    changes: {
      title: "🚧 Modifiche",
      columns: {
        layerFiles: "Livello / File",
        summary: "Riepilogo",
      },
    },
    reviewList: {
      title: "🔍 Riepilogo revisione",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Non sono stati trovati suggerimenti di revisione inline nelle modifiche fino al commit ${commitReference}:`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `È stato trovato ${count} suggerimento di revisione inline nelle modifiche fino al commit ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Sono stati trovati ${count} suggerimenti di revisione inline nelle modifiche fino al commit ${commitReference}:`,
      },
      footer:
        "<sub>I suggerimenti delle esecuzioni di revisione precedenti non sono elencati qui.</sub>",
      empty: "✨ Nessun problema trovato!",
    },
    otherSuggestions: {
      title: "💡 Altri suggerimenti",
      empty: "✨ Non ho altri feedback da fornire.",
    },
    details: {
      summary: "Dettagli",
    },
    rank: {
      high: "ALTO",
      medium: "MEDIO",
      low: "BASSO",
    },
    errors: {
      summary: "⚠️ Errori",
    },
    performanceMetrics: {
      summary: "📊 Matrice di Utilizzo del Modello e Prestazioni",
    },
    criticalError: {
      message:
        "⚠ La pipeline di revisione non e riuscita a causa di un errore critico. Controlla il job GitLab e riprova questo job.",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ La pipeline di revisione non e riuscita a causa di un errore critico. [**Controlla i dettagli della pipeline**](${linkToJobDetail}) e riprova questo job.`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ La revisione del codice è in corso... Sto esaminando il commit ${commitReference}. Per evitare conflitti, terrò in sospeso le revisioni successive finché quella corrente non sarà conclusa.`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `Se [**il processo di revisione**](${linkToJobDetail}) sembra bloccato, puoi eliminare manualmente questo commento per sbloccarlo. Prima però controlla lo stato dell'ultimo workflow CI di revisione per verificare che sia ancora in esecuzione oppure riavvialo se necessario.`,
      queueNotice: {
        zero: "Non ci sono altre revisioni in attesa dietro quella corrente.",
        one: ({ count }: { count: number }) =>
          `C'è ancora ${count} revisione in attesa dietro quella corrente.`,
        other: ({ count }: { count: number }) =>
          `Ci sono ancora ${count} revisioni in attesa dietro quella corrente.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
