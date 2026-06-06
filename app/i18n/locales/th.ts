import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const th = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 สรุปการรีวิวโค้ดโดย ${readableModelName}`,
    walkthrough: {
      title: "📋 ภาพรวม",
    },
    changes: {
      title: "🚧 การเปลี่ยนแปลง",
      columns: {
        layerFiles: "เลเยอร์ / ไฟล์",
        summary: "สรุป",
      },
    },
    reviewList: {
      title: "🔍 สรุปการรีวิว",
      header: {
        zero: "ไม่พบข้อเสนอแนะการรีวิวแบบอินไลน์",
        one: ({ count }: { count: number }) =>
          `พบข้อเสนอแนะการรีวิวแบบอินไลน์ ${count} รายการ:`,
        other: ({ count }: { count: number }) =>
          `พบข้อเสนอแนะการรีวิวแบบอินไลน์ ${count} รายการ:`,
      },
      footer: "<sub>ข้อเสนอแนะจากรอบการรีวิวก่อนหน้าไม่ได้แสดงไว้ที่นี่</sub>",
      empty: "✨ ไม่พบปัญหา!",
    },
    otherSuggestions: {
      title: "💡 ข้อเสนอแนะอื่น ๆ",
      empty: "✨ ฉันไม่มีข้อเสนอแนะเพิ่มเติม",
    },
    details: {
      summary: "รายละเอียด",
    },
    rank: {
      high: "สูง",
      medium: "กลาง",
      low: "ต่ำ",
    },
    errors: {
      summary: "⚠️ ข้อผิดพลาด",
    },
    performanceMetrics: {
      summary: "📊 เมทริกซ์การใช้งานโมเดลและประสิทธิภาพ",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ กำลังรีวิวโค้ด... ฉันกำลังตรวจสอบคอมมิต ${commitReference} เพื่อหลีกเลี่ยงความขัดแย้ง ฉันจะพักการรีวิวถัดไปไว้จนกว่าการรีวิวปัจจุบันจะเสร็จสิ้น`,
      manualDeleteHint:
        "หากกระบวนการรีวิวดูเหมือนค้างอยู่ คุณสามารถลบคอมเมนต์นี้ด้วยตนเองเพื่อปลดบล็อกได้ แต่ก่อนอื่นควรตรวจสอบสถานะของ workflow CI สำหรับรีวิวล่าสุดก่อน เพื่อให้แน่ใจว่ายังทำงานอยู่ หรือสั่งรันใหม่หากจำเป็น",
      queueNotice: {
        zero: "ไม่มีรีวิวเพิ่มเติมที่รอต่อจากรีวิวปัจจุบัน",
        one: ({ count }: { count: number }) =>
          `มีรีวิวเพิ่มเติม ${count} รายการที่รอต่อจากรีวิวปัจจุบัน`,
        other: ({ count }: { count: number }) =>
          `มีรีวิวเพิ่มเติม ${count} รายการที่รอต่อจากรีวิวปัจจุบัน`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
