import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ar = {
  reviewSummary: {
    performanceMetrics: {
      summary: "مصفوفة استخدام النموذج والأداء",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ مراجعة الكود قيد التنفيذ... أنا أراجع الآن الالتزام ${commitReference}. لتجنب التعارضات، سأؤجل أي مراجعات لاحقة حتى تنتهي المراجعة الحالية.`,
      manualDeleteHint:
        "إذا بدا أن عملية المراجعة عالقة، يمكنك حذف هذا التعليق يدويًا لإلغاء الحظر. لكن تحقق أولًا من حالة أحدث سير عمل CI للمراجعة للتأكد من أنه ما زال يعمل، أو أعد تشغيله إذا لزم الأمر.",
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
