import type { ReviewItemEntity } from "../../types/review.types";
import { formatCollapsedLanguageHeader } from "../lang.ts";
import { modelDisplayName } from "../model-display.ts";
import {
  buildDetailsBlock,
  getLocalizedRecordValue,
  getRankInlineMath,
  getRenderedReviewMessages,
  isEnglishLanguage,
  isSameLanguage,
  normalizeReviewRank,
} from "./comment-helper";

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

export {
  buildDetailsBlock,
  getLocalizedRecordValue,
  getRankInlineMath,
  isEnglishLanguage,
  isSameLanguage,
  normalizeReviewRank,
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

export const getRequestedResponseLanguages = ({
  langs,
  collapsedLangs = [],
  sourceLanguage = "en",
}: {
  langs: string[];
  collapsedLangs?: string[];
  sourceLanguage?: string;
}): string[] => {
  return dedupeLanguages({
    langs: [
      sourceLanguage,
      ...mergeRequestedLanguages({ langs, collapsedLangs }),
    ],
  });
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
        lang: sourceLanguage,
      }),
      modelDisplayName,
    ]
      .filter((part) => part && part.length > 0)
      .join(" "),
    "",
    messageSections.join("\n\n\n"),
  ].join("\n");
};
