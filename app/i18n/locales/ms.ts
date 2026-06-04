import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ms = {
  reviewSummary: {
    performanceMetrics: {
      summary: "Matriks Penggunaan Model dan Prestasi",
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
