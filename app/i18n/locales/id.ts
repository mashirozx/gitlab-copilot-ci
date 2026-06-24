import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const id = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Ringkasan Tinjauan Kode oleh ${readableModelName}`,
    viewDetail: "Lihat detail",
    walkthrough: {
      title: "📋 Uraian",
    },
    changes: {
      title: "🚧 Perubahan",
      columns: {
        layerFiles: "Lapisan / Berkas",
        summary: "Ringkasan",
      },
    },
    reviewList: {
      title: "🔍 Ringkasan Tinjauan",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `✨ Tidak ada saran tinjauan inline yang ditemukan dalam perubahan hingga commit ${commitReference}.`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Ditemukan ${count} saran tinjauan inline dalam perubahan hingga commit ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Ditemukan ${count} saran tinjauan inline dalam perubahan hingga commit ${commitReference}:`,
      },
      footer:
        "<sub>Saran dari putaran tinjauan sebelumnya tidak ditampilkan di sini.</sub>",
    },
    otherSuggestions: {
      title: "💡 Saran Lainnya",
      empty: "✨ Saya tidak punya masukan tambahan.",
    },
    details: {
      summary: "Detail",
    },
    rank: {
      high: "TINGGI",
      medium: "SEDANG",
      low: "RENDAH",
    },
    errors: {
      summary: "⚠️ Kesalahan",
    },
    performanceMetrics: {
      summary: "📊 Matriks Penggunaan Model dan Kinerja",
    },
    criticalError: {
      message:
        "⚠ Pipeline peninjauan gagal dengan galat kritis. Periksa job GitLab dan coba ulang job ini.",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ Pipeline peninjauan gagal dengan galat kritis. [**Periksa detail pipeline**](${linkToJobDetail}) dan coba ulang job ini.`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Peninjauan kode sedang berlangsung... Saya sedang meninjau commit ${commitReference}. Untuk menghindari konflik, saya akan menahan peninjauan berikutnya sampai peninjauan saat ini selesai.`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `Jika [**proses peninjauan**](${linkToJobDetail}) tampak macet, Anda dapat menghapus komentar ini secara manual untuk membuka blokirnya. Namun, periksa dulu status workflow CI peninjauan terbaru untuk memastikan bahwa prosesnya masih berjalan, atau jalankan ulang bila perlu.`,
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
