import { argv } from "./argv";
import { countryCodeToFlagEmoji } from "./country-code-to-flag-emoji";

const LANGUAGE_FLAG_ALIASES: Record<string, string> = {
  en: "en-GB",
  zh: "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hant": "zh-CN",
  "zh-lzh": "zh-CN",
  "zh-hans-lzh": "zh-CN",
  "zh-hant-lzh": "zh-CN",
};
const LANGUAGE_DISPLAY_NAME_FALLBACKS: Record<string, string> = {
  "zh-hans": "简体中文",
  "zh-hant": "繁體中文",
  "zh-lzh": "文言文",
  "zh-hans-lzh": "文言文（简体）",
  "zh-hant-lzh": "文言文（繁體）",
};

const normalizedLanguageTagCache = new Map<string, string>();
const languageFlagTagCache = new Map<string, string | null>();
const languageFlagEmojiCache = new Map<string, string>();
const languageDisplayNameCache = new Map<string, string>();
const collapsedLanguageHeaderCache = new Map<string, string>();

const DEFAULT_LANGUAGE_TAG = "en";

const getCacheKey = ({ language }: { language: string }): string => {
  return language.trim().toLowerCase();
};

export const normalizeLanguageTagForDisplay = ({
  language,
}: {
  language: string;
}): string => {
  const cacheKey = getCacheKey({ language });
  const cachedValue = normalizedLanguageTagCache.get(cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const trimmedLanguage = language.trim();
  const normalizedLanguageTag =
    trimmedLanguage.length === 0
      ? (argv["thinking-lang"] ?? DEFAULT_LANGUAGE_TAG)
      : trimmedLanguage;

  normalizedLanguageTagCache.set(cacheKey, normalizedLanguageTag);
  return normalizedLanguageTag;
};

export const getLanguageFlagTag = ({
  languageTag,
}: {
  languageTag: string;
}): string | null => {
  const cacheKey = getCacheKey({ language: languageTag });

  if (languageFlagTagCache.has(cacheKey)) {
    return languageFlagTagCache.get(cacheKey) ?? null;
  }

  const aliasedLanguageTag = LANGUAGE_FLAG_ALIASES[cacheKey];

  if (aliasedLanguageTag !== undefined) {
    languageFlagTagCache.set(cacheKey, aliasedLanguageTag);
    return aliasedLanguageTag;
  }

  try {
    const resolvedFlagTag = new Intl.Locale(languageTag).region
      ? languageTag
      : null;
    languageFlagTagCache.set(cacheKey, resolvedFlagTag);
    return resolvedFlagTag;
  } catch {
    languageFlagTagCache.set(cacheKey, null);
    return null;
  }
};

export const getLanguageFlagEmoji = ({
  languageTag,
}: {
  languageTag: string;
}): string => {
  const cacheKey = getCacheKey({ language: languageTag });
  const cachedValue = languageFlagEmojiCache.get(cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const flagLanguageTag = getLanguageFlagTag({ languageTag });

  if (!flagLanguageTag) {
    languageFlagEmojiCache.set(cacheKey, "");
    return "";
  }

  try {
    const flagEmoji = countryCodeToFlagEmoji(flagLanguageTag);
    languageFlagEmojiCache.set(cacheKey, flagEmoji);
    return flagEmoji;
  } catch {
    languageFlagEmojiCache.set(cacheKey, "");
    return "";
  }
};

export const getLanguageDisplayName = ({
  language,
}: {
  language: string;
}): string => {
  const normalizedLanguageTag = normalizeLanguageTagForDisplay({ language });
  const cacheKey = getCacheKey({ language: normalizedLanguageTag });
  const cachedValue = languageDisplayNameCache.get(cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const fallbackLanguageName = LANGUAGE_DISPLAY_NAME_FALLBACKS[cacheKey];
  const trimmedLanguage = language.trim();
  let localizedLanguageName = fallbackLanguageName ?? trimmedLanguage;

  if (localizedLanguageName.length === 0) {
    localizedLanguageName = normalizedLanguageTag;
  }

  try {
    localizedLanguageName =
      new Intl.DisplayNames([normalizedLanguageTag], {
        type: "language",
      }).of(normalizedLanguageTag) ?? localizedLanguageName;
  } catch {
    localizedLanguageName = fallbackLanguageName ?? localizedLanguageName;
  }

  languageDisplayNameCache.set(cacheKey, localizedLanguageName);
  return localizedLanguageName;
};

export const formatCollapsedLanguageHeader = ({
  language,
}: {
  language: string;
}): string => {
  const cacheKey = getCacheKey({ language });
  const cachedValue = collapsedLanguageHeaderCache.get(cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const normalizedLanguageTag = normalizeLanguageTagForDisplay({ language });
  const localizedLanguageName = getLanguageDisplayName({
    language: normalizedLanguageTag,
  });
  const flag = getLanguageFlagEmoji({ languageTag: normalizedLanguageTag });
  const header = flag
    ? `${localizedLanguageName} ${flag}`
    : localizedLanguageName;

  collapsedLanguageHeaderCache.set(cacheKey, header);
  return header;
};
