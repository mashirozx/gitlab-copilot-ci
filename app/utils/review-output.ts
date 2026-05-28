import type {
  ReviewItemEntity,
  ReviewRankEntity,
  ReviewResponseEntity,
} from "../types/review.types";
import { countryCodeToFlagEmoji } from "./country-code-to-flag-emoji";
import { modelDisplayName } from "./model-display.ts";

const ENGLISH_LANGUAGE_KEY = "english";

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
  const normalized = language.trim().toLowerCase();

  return (
    normalized === "english" ||
    normalized === "en" ||
    normalized.startsWith("en-")
  );
};

export const getPromptTranslationLangs = ({
  langs,
  collapsedLangs = [],
}: {
  langs: string[];
  collapsedLangs?: string[];
}): string[] => {
  return mergeRequestedLanguages({
    langs,
    collapsedLangs,
  }).filter((lang) => !isEnglishLanguage({ language: lang }));
};

export const getDisplayLanguages = ({
  langs,
  collapsedLangs = [],
}: {
  langs: string[];
  collapsedLangs?: string[];
}): string[] => {
  const normalizedLangs = mergeRequestedLanguages({
    langs,
    collapsedLangs,
  });

  return normalizedLangs.length > 0 ? normalizedLangs : [ENGLISH_LANGUAGE_KEY];
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

const normalizeLanguageTagForDisplay = ({
  language,
}: {
  language: string;
}): string => {
  const trimmedLanguage = language.trim();

  if (trimmedLanguage.length === 0) {
    return ENGLISH_LANGUAGE_KEY;
  }

  return trimmedLanguage.toLowerCase() === ENGLISH_LANGUAGE_KEY
    ? "en"
    : trimmedLanguage;
};

const getCollapsedLanguageFlagTag = ({
  languageTag,
}: {
  languageTag: string;
}): string | null => {
  const normalizedLanguageTag = languageTag.trim().toLowerCase();

  if (normalizedLanguageTag === "en") {
    return "en-GB";
  }

  if (normalizedLanguageTag === "zh") {
    return "zh-CN";
  }

  try {
    return new Intl.Locale(languageTag).region ? languageTag : null;
  } catch {
    return null;
  }
};

const getCollapsedLanguageFlag = ({
  languageTag,
}: {
  languageTag: string;
}): string => {
  const flagLanguageTag = getCollapsedLanguageFlagTag({ languageTag });

  if (!flagLanguageTag) {
    return "";
  }

  try {
    return countryCodeToFlagEmoji(flagLanguageTag);
  } catch {
    return "";
  }
};

export const formatCollapsedLanguageHeader = ({
  language,
}: {
  language: string;
}): string => {
  const normalizedLanguageTag = normalizeLanguageTagForDisplay({ language });

  let localizedLanguageName = language.trim() || normalizedLanguageTag;

  try {
    localizedLanguageName =
      new Intl.DisplayNames([normalizedLanguageTag], {
        type: "language",
      }).of(normalizedLanguageTag) ?? localizedLanguageName;
  } catch {
    // Fall back to the requested language token when Intl cannot resolve it.
  }

  const flag = getCollapsedLanguageFlag({
    languageTag: normalizedLanguageTag,
  });

  return flag ? `${localizedLanguageName} ${flag}` : localizedLanguageName;
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
}: {
  review: ReviewItemEntity;
  displayLanguages: string[];
}): Array<{
  language: string;
  message: string;
}> => {
  return displayLanguages.flatMap((language) => {
    if (isEnglishLanguage({ language })) {
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
}: {
  marker: string;
  review: ReviewItemEntity;
  displayLanguages: string[];
  collapsedLanguages: string[];
}): string => {
  const renderedMessages = getRenderedReviewMessages({
    review,
    displayLanguages,
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
