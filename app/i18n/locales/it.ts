import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const it = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Matrice di Utilizzo del Modello e Prestazioni",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ La revisione del codice è in corso... Sto esaminando il commit ${commitReference}. Per evitare conflitti, terrò in sospeso le revisioni successive finché quella corrente non sarà conclusa.`,
      manualDeleteHint:
        "Se il processo di revisione sembra bloccato, puoi eliminare manualmente questo commento per sbloccarlo. Prima però controlla lo stato dell'ultimo workflow CI di revisione per verificare che sia ancora in esecuzione oppure riavvialo se necessario.",
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
