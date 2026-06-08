import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ms = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 Ringkasan Semakan Kod oleh ${readableModelName}`,
    walkthrough: {
      title: "📋 Penerangan",
    },
    changes: {
      title: "🚧 Perubahan",
      columns: {
        layerFiles: "Lapisan / Fail",
        summary: "Ringkasan",
      },
    },
    reviewList: {
      title: "🔍 Ringkasan Semakan",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `Tiada cadangan semakan sebaris ditemui dalam perubahan sehingga commit ${commitReference}:`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `${count} cadangan semakan sebaris ditemui dalam perubahan sehingga commit ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `${count} cadangan semakan sebaris ditemui dalam perubahan sehingga commit ${commitReference}:`,
      },
      footer:
        "<sub>Cadangan daripada larian semakan terdahulu tidak disenaraikan di sini.</sub>",
      empty: "✨ Tiada isu ditemui!",
    },
    otherSuggestions: {
      title: "💡 Cadangan Lain",
      empty: "✨ Saya tiada maklum balas tambahan.",
    },
    details: {
      summary: "Butiran",
    },
    rank: {
      high: "TINGGI",
      medium: "SEDERHANA",
      low: "RENDAH",
    },
    errors: {
      summary: "⚠️ Ralat",
    },
    performanceMetrics: {
      summary: "📊 Matriks Penggunaan Model dan Prestasi",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ Semakan kod sedang berjalan... Saya sedang menyemak komit ${commitReference}. Untuk mengelakkan konflik, saya akan menangguhkan semakan seterusnya sehingga semakan semasa selesai.`,
      manualDeleteHint:
        "Jika proses semakan kelihatan tersekat, anda boleh memadam komen ini secara manual untuk menyahsekatnya. Namun, semak dahulu status aliran kerja CI semakan yang terkini bagi memastikan ia masih berjalan atau jalankan semula jika perlu.",
      queueNotice: {
        zero: "Tiada semakan tambahan yang menunggu di belakang semakan semasa.",
        one: ({ count }: { count: number }) =>
          `Terdapat ${count} semakan tambahan yang menunggu di belakang semakan semasa.`,
        other: ({ count }: { count: number }) =>
          `Terdapat ${count} semakan tambahan yang menunggu di belakang semakan semasa.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
