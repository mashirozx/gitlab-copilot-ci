import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ta = {
  reviewSummary: {
    title: ({ readableModelName }: { readableModelName: string }) =>
      `📝 ${readableModelName} வழங்கிய குறியீட்டு மதிப்பாய்வு சுருக்கம்`,
    walkthrough: {
      title: "📋 நடைபாதை விளக்கம்",
    },
    changes: {
      title: "🚧 மாற்றங்கள்",
      columns: {
        layerFiles: "அடுக்கு / கோப்பு(கள்)",
        summary: "சுருக்கம்",
      },
    },
    reviewList: {
      title: "🔍 மதிப்பாய்வு சுருக்கம்",
      header: {
        zero: "Inline மதிப்பாய்வு பரிந்துரைகள் எதுவும் கிடைக்கவில்லை.",
        one: ({ count }: { count: number }) =>
          `${count} inline மதிப்பாய்வு பரிந்துரை கிடைத்தது:`,
        other: ({ count }: { count: number }) =>
          `${count} inline மதிப்பாய்வு பரிந்துரைகள் கிடைத்தன:`,
      },
      footer:
        "<sub>முந்தைய மதிப்பாய்வு ஓட்டங்களின் பரிந்துரைகள் இங்கு பட்டியலிடப்படவில்லை.</sub>",
      empty: "✨ எந்தப் பிரச்சினையும் கண்டுபிடிக்கப்படவில்லை!",
    },
    otherSuggestions: {
      title: "💡 பிற பரிந்துரைகள்",
      empty: "✨ எனக்கு கூடுதல் கருத்துகள் இல்லை.",
    },
    details: {
      summary: "விவரங்கள்",
    },
    rank: {
      high: "உயர்",
      medium: "நடுத்தரம்",
      low: "குறைவு",
    },
    errors: {
      summary: "⚠️ பிழைகள்",
    },
    performanceMetrics: {
      summary: "📊 மாதிரி பயன்பாடு மற்றும் செயல்திறன் அட்டவணை",
    },
  },
  reviewProcess: {
    reviewingMarker: {
      body: ({ commitReference }: { commitReference: string }) =>
        `⚠️ குறியீட்டு மதிப்பாய்வு நடைபெற்று வருகிறது... நான் தற்போது ${commitReference} commit ஐ மதிப்பாய்வு செய்கிறேன். முரண்பாடுகளைத் தவிர்க்க, தற்போதைய மதிப்பாய்வு முடியும் வரை அடுத்த மதிப்பாய்வுகளை காத்திருக்கவைக்கிறேன்.`,
      manualDeleteHint:
        "மதிப்பாய்வு செயல்முறை சிக்கியதாகத் தோன்றினால், இந்தக் கருத்தை கைமுறையாக நீக்கி தடையை நீக்கலாம். ஆனால் அதற்கு முன் சமீபத்திய review CI workflow இன் நிலையை சரிபார்த்து அது இன்னும் இயங்குகிறதா அல்லது தேவையெனில் மீண்டும் இயக்க வேண்டுமா என்பதை உறுதிசெய்யவும்.",
      queueNotice: {
        zero: "தற்போதைய மதிப்பாய்வுக்குப் பின்னால் காத்திருக்கும் கூடுதல் மதிப்பாய்வுகள் இல்லை.",
        one: ({ count }: { count: number }) =>
          `${count} கூடுதல் மதிப்பாய்வு தற்போதைய மதிப்பாய்வுக்குப் பின்னால் காத்திருக்கிறது.`,
        other: ({ count }: { count: number }) =>
          `${count} கூடுதல் மதிப்பாய்வுகள் தற்போதைய மதிப்பாய்வுக்குப் பின்னால் காத்திருக்கின்றன.`,
      },
    },
  },
} as const satisfies LocaleShape<typeof en>;
