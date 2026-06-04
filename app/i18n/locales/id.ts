import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const id = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Matriks Penggunaan Model dan Kinerja",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Peninjauan kode sedang berlangsung... Saya sedang meninjau commit ${commitReference}. Untuk menghindari konflik, saya akan menahan peninjauan berikutnya sampai peninjauan saat ini selesai.`,
      manualDeleteHint:
        "Jika proses peninjauan tampak macet, Anda dapat menghapus komentar ini secara manual untuk membuka blokirnya. Namun, periksa dulu status workflow CI peninjauan terbaru untuk memastikan bahwa prosesnya masih berjalan, atau jalankan ulang bila perlu.",
      queueNotice: {
        zero: "Tidak ada peninjauan tambahan yang menunggu di belakang peninjauan saat ini.",
        one: ({ count }: { count: number }) =>
          `Ada ${count} peninjauan tambahan yang menunggu di belakang peninjauan saat ini.`,
        other: ({ count }: { count: number }) =>
          `Ada ${count} peninjauan tambahan yang menunggu di belakang peninjauan saat ini.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
