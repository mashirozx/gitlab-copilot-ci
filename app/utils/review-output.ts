import type {
  ReviewItemEntity,
  ReviewRankEntity,
  ReviewResponseEntity,
} from "../types/review.types";
import { formatCollapsedLanguageHeader } from "./lang.ts";
import { modelDisplayName } from "./model-display.ts";

const normalizeLanguageForComparison = ({
  language,
}: {
  language: string;
}): {
  full: string;
  base: string;
} => {
  const trimmedLanguage = language.trim();

  if (trimmedLanguage.length === 0) {
    return {
      full: "",
      base: "",
    };
  }

  try {
    const canonicalLanguages = Intl.getCanonicalLocales(trimmedLanguage);
    let normalizedFullLanguage = trimmedLanguage.toLowerCase();

    if (canonicalLanguages.length > 0) {
      const firstCanonicalLanguage = canonicalLanguages[0];

      if (typeof firstCanonicalLanguage === "string") {
        normalizedFullLanguage = firstCanonicalLanguage.toLowerCase();
      }
    }

    return {
      full: normalizedFullLanguage,
      base: normalizedFullLanguage.split("-")[0] ?? normalizedFullLanguage,
    };
  } catch {
    const normalizedLanguage = trimmedLanguage.toLowerCase();

    return {
      full: normalizedLanguage,
      base: normalizedLanguage.split("-")[0] ?? normalizedLanguage,
    };
  }
};

export const isSameLanguage = ({
  left,
  right,
}: {
  left: string;
  right: string;
}): boolean => {
  const normalizedLeft = normalizeLanguageForComparison({ language: left });
  const normalizedRight = normalizeLanguageForComparison({ language: right });

  if (normalizedLeft.full.length === 0 || normalizedRight.full.length === 0) {
    return false;
  }

  if (normalizedLeft.full === normalizedRight.full) {
    return true;
  }

  return (
    normalizedLeft.base === normalizedRight.base &&
    (normalizedLeft.full === normalizedLeft.base ||
      normalizedRight.full === normalizedRight.base)
  );
};

const REVIEW_RANK_META: Record<
  ReviewRankEntity,
  {
    color: string;
    label: string;
  }
> = {
  HIGH: {
    color: "#ff4d4f",
    label: "HIGH",
  },
  MEDIUM: {
    color: "#1890ff",
    label: "MEDIUM",
  },
  LOW: {
    color: "#52c41a",
    label: "LOW",
  },
};

const dedupeLanguages = ({ langs }: { langs: string[] }): string[] => {
  const seen = new Set<string>();

  return langs.filter((lang) => {
    const normalized = lang.trim().toLowerCase();

    if (normalized.length === 0 || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

const mergeRequestedLanguages = ({
  langs,
  collapsedLangs,
}: {
  langs: string[];
  collapsedLangs: string[];
}): string[] => {
  return dedupeLanguages({
    langs: [...langs, ...collapsedLangs],
  });
};

export const isEnglishLanguage = ({
  language,
}: {
  language: string;
}): boolean => {
  return isSameLanguage({
    left: language,
    right: "en",
  });
};

export const getPromptTranslationLangs = ({
  langs,
  collapsedLangs = [],
  sourceLanguage = "en",
}: {
  langs: string[];
  collapsedLangs?: string[];
  sourceLanguage?: string;
}): string[] => {
  return mergeRequestedLanguages({
    langs,
    collapsedLangs,
  }).filter((lang) => !isSameLanguage({ left: lang, right: sourceLanguage }));
};

export const getDisplayLanguages = ({
  langs,
  collapsedLangs = [],
  sourceLanguage = "en",
}: {
  langs: string[];
  collapsedLangs?: string[];
  sourceLanguage?: string;
}): string[] => {
  const normalizedLangs = mergeRequestedLanguages({
    langs,
    collapsedLangs,
  });

  return normalizedLangs.length > 0 ? normalizedLangs : [sourceLanguage];
};

export const buildDetailsBlock = ({
  summary,
  content,
}: {
  summary: string;
  content: string;
}): string => {
  return `<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>`;
};

export const normalizeReviewRank = ({
  rank,
}: {
  rank: string | undefined;
}): ReviewRankEntity => {
  const normalizedRank = rank?.trim().toUpperCase();

  if (normalizedRank === "HIGH") {
    return "HIGH";
  }

  if (normalizedRank === "LOW") {
    return "LOW";
  }

  return "MEDIUM";
};

export const normalizeReviewResponse = ({
  response,
  translationLangs = [],
}: {
  response: ReviewResponseEntity;
  translationLangs?: string[];
}): ReviewResponseEntity => {
  const rawSummaryTranslations = response.summary?.translations;
  const normalizedSummaryTranslations = Array.isArray(rawSummaryTranslations)
    ? rawSummaryTranslations.reduce<Record<string, string>>(
        (translations, translation, index) => {
          const language = translationLangs[index];

          if (!language || typeof translation !== "string") {
            return translations;
          }

          translations[language] = translation;
          return translations;
        },
        {},
      )
    : rawSummaryTranslations && typeof rawSummaryTranslations === "object"
      ? rawSummaryTranslations
      : {};

  return {
    ...response,
    summary: {
      content: response.summary?.content ?? "",
      translations: normalizedSummaryTranslations,
    },
    reviews: (response.reviews ?? []).map((review) => ({
      ...review,
      rank: normalizeReviewRank({ rank: review.rank }),
    })),
  };
};

export const getRankInlineMath = ({
  rank,
  label,
}: {
  rank: ReviewRankEntity;
  label?: string;
}): string => {
  const meta = REVIEW_RANK_META[rank];

  return `$\\colorbox{${meta.color}}{\\color{white}{\\text{${label ?? meta.label}}}}$`;
};

const getRenderedReviewMessages = ({
  review,
  displayLanguages,
  sourceLanguage = "en",
}: {
  review: ReviewItemEntity;
  displayLanguages: string[];
  sourceLanguage?: string;
}): Array<{
  language: string;
  message: string;
}> => {
  return displayLanguages.flatMap((language) => {
    if (isSameLanguage({ left: language, right: sourceLanguage })) {
      return review.suggestion.trim().length > 0
        ? [
            {
              language,
              message: review.suggestion,
            },
          ]
        : [];
    }

    const translation = review.translations?.[language];

    return translation && translation.trim().length > 0
      ? [
          {
            language,
            message: translation,
          },
        ]
      : [];
  });
};

export const buildReviewDiscussionBody = ({
  marker,
  review,
  displayLanguages,
  collapsedLanguages,
  sourceLanguage = "en",
}: {
  marker: string;
  review: ReviewItemEntity;
  displayLanguages: string[];
  collapsedLanguages: string[];
  sourceLanguage?: string;
}): string => {
  const renderedMessages = getRenderedReviewMessages({
    review,
    displayLanguages,
    sourceLanguage,
  });
  const collapsedLanguageSet = new Set(
    collapsedLanguages.map((language) => language.trim().toLowerCase()),
  );
  const expandedSections: string[] = [];
  const collapsedSections: string[] = [];

  renderedMessages.forEach(({ language, message }) => {
    const normalizedLanguage = language.trim().toLowerCase();

    if (!collapsedLanguageSet.has(normalizedLanguage)) {
      expandedSections.push(message);
      return;
    }

    collapsedSections.push(
      buildDetailsBlock({
        summary: formatCollapsedLanguageHeader({ language }),
        content: message,
      }),
    );
  });

  const messageSections: string[] = [];

  if (expandedSections.length > 0) {
    messageSections.push(expandedSections.join("\n\n\n"));
  }

  if (collapsedSections.length > 0) {
    const collapsedBlock = [
      "---",
      collapsedSections.join("\n\n---\n\n"),
      "---",
    ].join("\n\n");

    messageSections.push(collapsedBlock);
  }

  return [
    marker,
    "",
    [
      getRankInlineMath({
        rank: normalizeReviewRank({ rank: review.rank }),
      }),
      modelDisplayName,
    ]
      .filter((part) => part && part.length > 0)
      .join(" "),
    "",
    messageSections.join("\n\n\n"),
  ].join("\n");
};
