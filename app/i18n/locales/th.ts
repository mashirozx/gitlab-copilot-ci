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
        zero: ({
          count: _count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `ไม่พบข้อเสนอแนะการรีวิวแบบอินไลน์ในความเปลี่ยนแปลงจนถึงคอมมิต ${commitReference}:`,
        one: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `พบข้อเสนอแนะการรีวิวแบบอินไลน์ ${count} รายการในความเปลี่ยนแปลงจนถึงคอมมิต ${commitReference}:`,
        other: ({
          count,
          commitReference,
        }: {
          count: number;
          commitReference: string;
        }) =>
          `พบข้อเสนอแนะการรีวิวแบบอินไลน์ ${count} รายการในความเปลี่ยนแปลงจนถึงคอมมิต ${commitReference}:`,
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
    criticalError: {
      message:
        "⚠ ไปป์ไลน์การรีวิวล้มเหลวด้วยข้อผิดพลาดร้ายแรง โปรดตรวจสอบงาน GitLab และลองรันงานนี้อีกครั้ง",
      messageWithLinks: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `⚠ ไปป์ไลน์การรีวิวล้มเหลวด้วยข้อผิดพลาดร้ายแรง โปรด[**ตรวจสอบรายละเอียดไปป์ไลน์**](${linkToJobDetail}) และลองรันงานนี้อีกครั้ง`,
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ กำลังรีวิวโค้ด... ฉันกำลังตรวจสอบคอมมิต ${commitReference} เพื่อหลีกเลี่ยงความขัดแย้ง ฉันจะพักการรีวิวถัดไปไว้จนกว่าการรีวิวปัจจุบันจะเสร็จสิ้น`,
      manualDeleteHint: ({ linkToJobDetail }: { linkToJobDetail: string }) =>
        `หาก[**กระบวนการรีวิว**](${linkToJobDetail})ดูเหมือนค้างอยู่ คุณสามารถลบคอมเมนต์นี้ด้วยตนเองเพื่อปลดบล็อกได้ แต่ก่อนอื่นควรตรวจสอบสถานะของ workflow CI สำหรับรีวิวล่าสุดก่อน เพื่อให้แน่ใจว่ายังทำงานอยู่ หรือสั่งรันใหม่หากจำเป็น`,
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
