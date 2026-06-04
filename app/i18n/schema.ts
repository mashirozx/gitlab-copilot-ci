export type InterpolationPrimitive = string | number | bigint | boolean;

export type TranslationLeaf = string | ((...args: never[]) => string);

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

export type PluralTranslation = {
  readonly other: TranslationLeaf;
  readonly zero?: TranslationLeaf;
  readonly one?: TranslationLeaf;
  readonly two?: TranslationLeaf;
  readonly few?: TranslationLeaf;
  readonly many?: TranslationLeaf;
};

export type IsPluralTranslation<T> = T extends {
  readonly other: unknown;
}
  ? Exclude<keyof T, PluralCategory> extends never
    ? true
    : false
  : false;

export type TranslationTree = {
  readonly [key: string]: TranslationLeaf | PluralTranslation | TranslationTree;
};

type LocaleValueShape<T> = T extends string
  ? string
  : T extends (...args: infer TArgs) => string
    ? (...args: TArgs) => string
    : IsPluralTranslation<T> extends true
      ? {
          readonly [K in keyof T]: LocaleValueShape<T[K]>;
        }
      : T extends TranslationTree
        ? LocaleShape<T>
        : never;

export type LocaleShape<T> = {
  readonly [K in keyof T]: LocaleValueShape<T[K]>;
};

export const defineLocale = <const T extends TranslationTree>(locale: T): T =>
  locale;
