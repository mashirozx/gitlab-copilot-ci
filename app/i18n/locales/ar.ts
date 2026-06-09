import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ar = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 ملخص مراجعة الكود بواسطة ${readableModelName}`,
    walkthrough: {
      title: "📋 شرح التغييرات",
    },
    changes: {
      title: "🚧 التغييرات",
      columns: {
        layerFiles: "الطبقة / الملف(ات)",
        summary: "الملخص",
      },
    },
    reviewList: {
      title: "🔍 ملخص المراجعة",
      header: {
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `لم يتم العثور على ملاحظات مراجعة مضمنة في التغييرات حتى الالتزام ${commitReference}:`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `تم العثور على ${count} ملاحظة مراجعة مضمنة في التغييرات حتى الالتزام ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `تم العثور على ${count} ملاحظات مراجعة مضمنة في التغييرات حتى الالتزام ${commitReference}:`,
      },
      footer: "<sub>اقتراحات جولات المراجعة السابقة غير مدرجة هنا.</sub>",
      empty: "✨ لم يتم العثور على أي مشكلات!",
    },
    otherSuggestions: {
      title: "💡 اقتراحات أخرى",
      empty: "✨ ليست لدي ملاحظات إضافية.",
    },
    details: {
      summary: "التفاصيل",
    },
    rank: {
      high: "مرتفع",
      medium: "متوسط",
      low: "منخفض",
    },
    errors: {
      summary: "⚠️ أخطاء",
    },
    performanceMetrics: {
      summary: "📊 مصفوفة استخدام النموذج والأداء",
    },
    criticalError: {
      message:
        "⚠ فشل مسار المراجعة بسبب خطأ حرج. يرجى التحقق من مهمة GitLab أو إعادة تشغيل المسار.",
      messageWithLinks: ({
        linkToJobDetail,
        linkToJobRetry,
      }: {
        linkToJobDetail: string;
        linkToJobRetry: string;
      }) =>
        `⚠ فشل مسار المراجعة بسبب خطأ حرج. يرجى [**التحقق من تفاصيل المسار**](${linkToJobDetail}) أو [**إعادة محاولة المسار**](${linkToJobRetry}).`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ مراجعة الكود قيد التنفيذ... أنا أراجع الآن الالتزام ${commitReference}. لتجنب التعارضات، سأؤجل أي مراجعات لاحقة حتى تنتهي المراجعة الحالية.`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `إذا بدا أن [**عملية المراجعة**](${linkToJobDetail}) عالقة، يمكنك حذف هذا التعليق يدويًا لإلغاء الحظر. لكن تحقق أولًا من حالة أحدث سير عمل CI للمراجعة للتأكد من أنه ما زال يعمل، أو أعد تشغيله إذا لزم الأمر.`,
      queueNotice: {
        zero: "لا توجد مراجعات إضافية تنتظر خلف المراجعة الحالية.",
        one: ({ count }: { count: number }) =>
          `توجد ${count} مراجعة إضافية تنتظر خلف المراجعة الحالية.`,
        other: ({ count }: { count: number }) =>
          `توجد ${count} مراجعات إضافية تنتظر خلف المراجعة الحالية.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
