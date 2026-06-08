import { t } from "../../i18n";
import type {
  ReviewItemEntity,
  ReviewRankEntity,
  ReviewSuggestionEntity,
} from "../../types/review.types";
import {
  getCurrentCommitShortSha,
  getCurrentCommitUrl,
} from "../commit-reference";

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

export const buildDetailsBlock = ({
  summary,
  content,
}: {
  summary: string;
  content: string;
}): string => {
  return `<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>`;
};

export const buildCurrentCommitReference = (): string => {
  const commitShortSha = getCurrentCommitShortSha();
  const commitUrl = getCurrentCommitUrl();

  return commitUrl
    ? `[\`${commitShortSha}\`](${commitUrl})`
    : `\`${commitShortSha}\``;
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

export const getRankInlineMath = ({
  rank,
  lang,
}: {
  rank: ReviewRankEntity;
  lang: string;
}): string => {
  const meta = REVIEW_RANK_META[rank];
  const label =
    rank === "HIGH"
      ? t("reviewSummary.rank.high", { lang })
      : rank === "LOW"
        ? t("reviewSummary.rank.low", { lang })
        : t("reviewSummary.rank.medium", { lang });

  return `$\\colorbox{${meta.color}}{\\color{white}{\\text{${label}}}}$`;
};

export const getLocalizedRecordValue = <TValue>({
  record,
  language,
}: {
  record: Record<string, TValue>;
  language: string;
}): TValue | null => {
  const matchedEntry = Object.entries(record).find(([recordLanguage]) =>
    isSameLanguage({
      left: recordLanguage,
      right: language,
    }),
  );

  return matchedEntry?.[1] ?? null;
};

export const getRenderedReviewMessages = ({
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
    const localizedSuggestion = getLocalizedRecordValue<ReviewSuggestionEntity>(
      {
        record: review.suggestions,
        language,
      },
    );

    return localizedSuggestion && localizedSuggestion.detail.trim().length > 0
      ? [
          {
            language,
            message: localizedSuggestion.detail,
          },
        ]
      : [];
  });
};
