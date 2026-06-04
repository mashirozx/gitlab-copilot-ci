import type { LocaleShape } from "../schema";
import type { en } from "./en";

export const ta = {
  reviewSummary: {
    performanceMetrics: {
      summary: "மாதிரி பயன்பாடு மற்றும் செயல்திறன் அட்டவணை",
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
