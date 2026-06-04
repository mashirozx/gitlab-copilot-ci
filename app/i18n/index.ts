import { argv } from "../utils/argv";
import type { en } from "./locales/en";
import type {
  InterpolationPrimitive,
  LocaleShape,
  PluralCategory,
  PluralTranslation,
  TranslationTree,
} from "./schema";

type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;

type LocaleSchema = LocaleShape<typeof en>;

type IsPluralLeaf<T> = T extends { readonly other: unknown } ? true : false;

type RuntimeTranslationLeaf =
  | string
  | ((params: Record<string, InterpolationPrimitive>) => string);

type I18nEntity = LocaleSchema;

type TerminalTranslationKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends (...args: infer _TArgs) => string
      ? K
      : IsPluralLeaf<T[K]> extends true
        ? K
        : never;
}[keyof T & string];

type NestedObjectTranslationKey<T> = {
  [K in keyof T & string]: IsPluralLeaf<T[K]> extends true
    ? never
    : T[K] extends Record<string, unknown>
      ? K
      : never;
}[keyof T & string];

type NestedTranslationKeyLevel4<T> = TerminalTranslationKey<T>;

type NestedTranslationKeyLevel3<T> =
  | TerminalTranslationKey<T>
  | {
      [K in NestedObjectTranslationKey<T>]: T[K] extends Record<string, unknown>
        ? `${K}${DotPrefix<NestedTranslationKeyLevel4<T[K]>>}`
        : never;
    }[NestedObjectTranslationKey<T>];

type NestedTranslationKeyLevel2<T> =
  | TerminalTranslationKey<T>
  | {
      [K in NestedObjectTranslationKey<T>]: T[K] extends Record<string, unknown>
        ? `${K}${DotPrefix<NestedTranslationKeyLevel3<T[K]>>}`
        : never;
    }[NestedObjectTranslationKey<T>];

type NestedTranslationKey<T> =
  | TerminalTranslationKey<T>
  | {
      [K in NestedObjectTranslationKey<T>]: T[K] extends Record<string, unknown>
        ? `${K}${DotPrefix<NestedTranslationKeyLevel2<T[K]>>}`
        : never;
    }[NestedObjectTranslationKey<T>];

type TranslationValueAtPath<
  T,
  TPath extends string,
> = TPath extends `${infer THead}.${infer TTail}`
  ? THead extends keyof T
    ? TranslationValueAtPath<T[THead], TTail>
    : never
  : TPath extends keyof T
    ? T[TPath]
    : never;

export type TranslationKey = NestedTranslationKey<LocaleSchema>;

type ExtractFunctionParams<T> = T extends (...args: infer TArgs) => string
  ? TArgs
  : never;

type ExtractPluralParams<T> = [
  ExtractFunctionParams<NonNullable<T[keyof T & string]>>,
] extends [never]
  ? [{ count: number }]
  : ExtractFunctionParams<NonNullable<T[keyof T & string]>>;

type TranslationArgsForValue<
  TPath extends TranslationKey,
  TValue,
> = TValue extends (...args: infer TArgs) => string
  ? [key: TPath, ...args: TArgs]
  : IsPluralLeaf<TValue> extends true
    ? [key: TPath, ...ExtractPluralParams<TValue>]
    : [key: TPath];

export type TranslationArgs<TPath extends TranslationKey> =
  TranslationArgsForValue<TPath, TranslationValueAtPath<LocaleSchema, TPath>>;

const localeLoaders = {
  en: async () => (await import("./locales/en.ts")).en,
  zh: async () => (await import("./locales/zh.ts")).zh,
  "zh-TW": async () => (await import("./locales/zh-TW.ts")).zhTW,
  "zh-HK": async () => (await import("./locales/zh-HK.ts")).zhHK,
  "zh-Hans": async () => (await import("./locales/zh-Hans.ts")).zhHans,
  "zh-Hant": async () => (await import("./locales/zh-Hant.ts")).zhHant,
  "zh-lzh": async () => (await import("./locales/zh-lzh.ts")).zhLzh,
  "zh-Hans-lzh": async () =>
    (await import("./locales/zh-Hans-lzh.ts")).zhHansLzh,
  "zh-Hant-lzh": async () =>
    (await import("./locales/zh-Hant-lzh.ts")).zhHantLzh,
  ja: async () => (await import("./locales/ja.ts")).ja,
  de: async () => (await import("./locales/de.ts")).de,
  fr: async () => (await import("./locales/fr.ts")).fr,
  es: async () => (await import("./locales/es.ts")).es,
  it: async () => (await import("./locales/it.ts")).it,
  pt: async () => (await import("./locales/pt.ts")).pt,
  ru: async () => (await import("./locales/ru.ts")).ru,
  ko: async () => (await import("./locales/ko.ts")).ko,
  th: async () => (await import("./locales/th.ts")).th,
  fa: async () => (await import("./locales/fa.ts")).fa,
  ar: async () => (await import("./locales/ar.ts")).ar,
  id: async () => (await import("./locales/id.ts")).id,
  ms: async () => (await import("./locales/ms.ts")).ms,
  ta: async () => (await import("./locales/ta.ts")).ta,
} as const satisfies Record<string, () => Promise<I18nEntity>>;

export type SupportedLocaleKey = keyof typeof localeLoaders;

const supportedLocaleKeys = Object.keys(localeLoaders) as SupportedLocaleKey[];
const DEFAULT_LOCALE = "en" satisfies SupportedLocaleKey;
const pluralCategorySet = new Set<string>([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);
const localeCache = new Map<SupportedLocaleKey, Promise<I18nEntity>>();
let initializedLocale: I18nEntity | null = null;
let initializedLocaleCode: SupportedLocaleKey | null = null;
let initializationState: {
  localeKey: SupportedLocaleKey;
  promise: Promise<I18nEntity>;
} | null = null;

const normalizeLocaleForLookup = ({
  languageTag,
}: {
  languageTag: string;
}): string => {
  const trimmedLanguageTag = languageTag.trim();

  if (trimmedLanguageTag.length === 0) {
    return DEFAULT_LOCALE.toLowerCase();
  }

  try {
    return (
      Intl.getCanonicalLocales(trimmedLanguageTag)[0] ?? trimmedLanguageTag
    ).toLowerCase();
  } catch {
    return trimmedLanguageTag.toLowerCase();
  }
};

const getPrimaryLanguageTag = ({
  languageTag,
}: {
  languageTag: string;
}): string => {
  return normalizeLocaleForLookup({ languageTag }).split("-")[0] ?? languageTag;
};

const localeKeyMap = new Map(
  supportedLocaleKeys.map((languageTag) => [
    normalizeLocaleForLookup({ languageTag }),
    languageTag,
  ]),
);

const uniqueLanguageTags = ({
  languageTags,
}: {
  languageTags: string[];
}): string[] => {
  return [
    ...new Set(languageTags.filter((languageTag) => languageTag.length > 0)),
  ];
};

export const resolveLocaleKey = ({
  languageTag,
  fallbackLanguageTag = argv["thinking-lang"],
}: {
  languageTag?: string;
  fallbackLanguageTag?: string;
} = {}): SupportedLocaleKey => {
  const requestedLanguageTag = normalizeLocaleForLookup({
    languageTag: languageTag ?? fallbackLanguageTag ?? DEFAULT_LOCALE,
  });
  const resolvedFallbackLanguageTag = normalizeLocaleForLookup({
    languageTag: fallbackLanguageTag ?? DEFAULT_LOCALE,
  });

  const candidates = uniqueLanguageTags({
    languageTags: [
      requestedLanguageTag,
      getPrimaryLanguageTag({ languageTag: requestedLanguageTag }),
      resolvedFallbackLanguageTag,
      getPrimaryLanguageTag({ languageTag: resolvedFallbackLanguageTag }),
      DEFAULT_LOCALE,
    ],
  });

  for (const candidate of candidates) {
    const localeKey = localeKeyMap.get(candidate);

    if (localeKey !== undefined) {
      return localeKey;
    }
  }

  return DEFAULT_LOCALE;
};

const loadLocale = async ({
  localeKey,
}: {
  localeKey: SupportedLocaleKey;
}): Promise<I18nEntity> => {
  const cachedLocale = localeCache.get(localeKey);

  if (cachedLocale) {
    return cachedLocale;
  }

  const localePromise = localeLoaders[localeKey]();
  localeCache.set(localeKey, localePromise);
  return localePromise;
};

const isPluralTranslationValue = (
  value: unknown,
): value is PluralTranslation & {
  readonly [K in PluralCategory]?: RuntimeTranslationLeaf;
} => {
  if (typeof value !== "object" || value === null || !("other" in value)) {
    return false;
  }

  return Object.keys(value).every((key) => pluralCategorySet.has(key));
};

const getTranslationValue = ({
  locale,
  key,
}: {
  locale: I18nEntity;
  key: TranslationKey;
}): RuntimeTranslationLeaf | PluralTranslation => {
  const keySegments = key.split(".");
  let currentValue:
    | RuntimeTranslationLeaf
    | PluralTranslation
    | TranslationTree = locale;

  for (const keySegment of keySegments) {
    if (
      typeof currentValue === "string" ||
      typeof currentValue === "function" ||
      isPluralTranslationValue(currentValue)
    ) {
      throw new Error(
        `Translation key "${key}" does not resolve to a leaf value.`,
      );
    }

    const currentNode = currentValue as Record<
      string,
      RuntimeTranslationLeaf | PluralTranslation | TranslationTree
    >;
    const nextValue = currentNode[keySegment];

    if (nextValue === undefined) {
      throw new Error(`Missing translation key "${key}".`);
    }

    currentValue = nextValue;
  }

  if (
    typeof currentValue !== "string" &&
    typeof currentValue !== "function" &&
    !isPluralTranslationValue(currentValue)
  ) {
    throw new Error(
      `Translation key "${key}" does not resolve to a leaf value.`,
    );
  }

  return currentValue;
};

const resolvePluralBranch = ({
  translationValue,
  params,
  localeCode,
  key,
}: {
  translationValue: PluralTranslation & {
    readonly [K in PluralCategory]?: RuntimeTranslationLeaf;
  };
  params: Record<string, InterpolationPrimitive> | undefined;
  localeCode: SupportedLocaleKey;
  key: TranslationKey;
}): RuntimeTranslationLeaf => {
  const count = params?.count;

  if (typeof count !== "number") {
    throw new Error(
      `Plural translation key "${key}" requires a numeric count parameter.`,
    );
  }

  if (count === 0 && translationValue.zero !== undefined) {
    return translationValue.zero;
  }

  const pluralRulesLocale =
    uniqueLanguageTags({
      languageTags: [
        normalizeLocaleForLookup({ languageTag: localeCode }),
        getPrimaryLanguageTag({ languageTag: localeCode }),
        DEFAULT_LOCALE,
      ],
    }).find((candidate) => {
      try {
        new Intl.PluralRules(candidate);
        return true;
      } catch {
        return false;
      }
    }) ?? DEFAULT_LOCALE;

  const pluralCategory = new Intl.PluralRules(pluralRulesLocale).select(
    count,
  ) as Exclude<PluralCategory, "zero">;

  return translationValue[pluralCategory] ?? translationValue.other;
};

type Translator = <TPath extends TranslationKey>(
  ...args: TranslationArgs<TPath>
) => string;

export const initI18n = async ({
  languageTag,
  fallbackLanguageTag,
}: {
  languageTag?: string;
  fallbackLanguageTag?: string;
} = {}): Promise<void> => {
  const localeKey = resolveLocaleKey({ languageTag, fallbackLanguageTag });

  if (initializedLocale !== null && initializedLocaleCode === localeKey) {
    return;
  }

  if (initializationState?.localeKey !== localeKey) {
    initializationState = {
      localeKey,
      promise: loadLocale({ localeKey }),
    };
  }

  const locale = await initializationState.promise;

  initializedLocale = locale;
  initializedLocaleCode = localeKey;

  if (initializationState?.localeKey === localeKey) {
    initializationState = null;
  }
};

export const getCurrentLocaleCode = (): SupportedLocaleKey => {
  return initializedLocaleCode ?? resolveLocaleKey();
};

export const t = ((...args: unknown[]) => {
  const [key, params] = args as [
    TranslationKey,
    Record<string, InterpolationPrimitive> | undefined,
  ];
  const locale = initializedLocale;

  if (locale === null) {
    throw new Error(
      "i18n has not been initialized. Call initI18n() and await it before using t().",
    );
  }

  const localeCode = getCurrentLocaleCode();
  const translationValue = getTranslationValue({ locale, key });

  if (isPluralTranslationValue(translationValue)) {
    const resolvedBranch = resolvePluralBranch({
      translationValue,
      params,
      localeCode,
      key,
    });

    if (typeof resolvedBranch === "function") {
      return resolvedBranch(params ?? {});
    }

    return resolvedBranch;
  }

  if (typeof translationValue === "function") {
    return translationValue(params ?? {});
  }

  return translationValue;
}) as Translator;
