import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const fa = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 خلاصه بازبینی کد توسط ${readableModelName}`,
    walkthrough: {
      title: "📋 مرور تغییرات",
    },
    changes: {
      title: "🚧 تغییرات",
      columns: {
        layerFiles: "لایه / پرونده(ها)",
        summary: "خلاصه",
      },
    },
    reviewList: {
      title: "🔍 خلاصه بازبینی",
      header: {
        zero: "هیچ پیشنهاد بازبینی درون‌خطی پیدا نشد.",
        one: ({ count }: { count: number }) =>
          `${count} پیشنهاد بازبینی درون‌خطی پیدا شد:`,
        other: ({ count }: { count: number }) =>
          `${count} پیشنهاد بازبینی درون‌خطی پیدا شد:`,
      },
      footer:
        "<sub>پیشنهادهای اجراهای بازبینی قبلی در اینجا فهرست نمی‌شوند.</sub>",
      empty: "✨ مشکلی پیدا نشد!",
    },
    otherSuggestions: {
      title: "💡 پیشنهادهای دیگر",
      empty: "✨ بازخورد دیگری ندارم.",
    },
    details: {
      summary: "جزئیات",
    },
    rank: {
      high: "بالا",
      medium: "متوسط",
      low: "پایین",
    },
    errors: {
      summary: "⚠️ خطاها",
    },
    performanceMetrics: {
      summary: "📊 ماتریس مصرف مدل و عملکرد",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ بازبینی کد در حال انجام است... من در حال بررسی کامیت ${commitReference} هستم. برای جلوگیری از تداخل، بازبینی‌های بعدی را تا پایان این بازبینی متوقف می‌کنم.`,
      manualDeleteHint:
        "اگر فرایند بازبینی گیر کرده به نظر می‌رسد، می‌توانید این دیدگاه را به‌صورت دستی حذف کنید تا باز شود. اما ابتدا وضعیت آخرین workflow بازبینی CI را بررسی کنید تا مطمئن شوید هنوز در حال اجراست یا در صورت نیاز آن را دوباره اجرا کنید.",
      queueNotice: {
        zero: "هیچ بازبینی دیگری پشت بازبینی فعلی در انتظار نیست.",
        one: ({ count }: { count: number }) =>
          `${count} بازبینی دیگر پشت بازبینی فعلی در انتظار است.`,
        other: ({ count }: { count: number }) =>
          `${count} بازبینی دیگر پشت بازبینی فعلی در انتظار هستند.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
