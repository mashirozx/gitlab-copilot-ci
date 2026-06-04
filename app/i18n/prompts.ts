const CLASSICAL_CHINESE_PROMPT_NOTES: Record<string, string> = {
  "zh-lzh":
    '补充说明：这里的“文言文”指古典汉语书面语。请使用文言文撰写 "summary.content" 与每条 "suggestion"，并使用简体汉字。',
  "zh-hans-lzh":
    '补充说明：这里的“文言文”指古典汉语书面语。请使用文言文撰写 "summary.content" 与每条 "suggestion"，并使用简体汉字。',
  "zh-hant-lzh":
    '补充说明：这里的“文言文”指古典汉语书面语。请使用文言文撰写 "summary.content" 与每条 "suggestion"，并使用繁體漢字。',
};

const CLASSICAL_CHINESE_TRANSLATION_PROMPT_NOTES: Record<string, string> = {
  "zh-lzh":
    '补充说明：如果需要返回 "zh-lzh" 翻译，请使用文言文撰写对应的 "summary.translations["zh-lzh"]" 与每条 "reviews[].translations["zh-lzh"]"，并使用简体汉字。',
  "zh-hans-lzh":
    '补充说明：如果需要返回 "zh-hans-lzh" 翻译，请使用文言文撰写对应的 "summary.translations["zh-hans-lzh"]" 与每条 "reviews[].translations["zh-hans-lzh"]"，并使用简体汉字。',
  "zh-hant-lzh":
    '补充说明：如果需要返回 "zh-hant-lzh" 翻译，请使用文言文撰写对应的 "summary.translations["zh-hant-lzh"]" 与每条 "reviews[].translations["zh-hant-lzh"]"，并使用繁體漢字。',
};

const normalizeLanguageTag = ({ language }: { language: string }): string => {
  return language.trim().toLowerCase();
};

export const buildSpecialLanguageInstructions = ({
  sourceLanguage,
  translationLanguages = [],
}: {
  sourceLanguage: string;
  translationLanguages?: string[];
}): string => {
  const normalizedSourceLanguage = normalizeLanguageTag({
    language: sourceLanguage,
  });
  const sourceLanguageNote =
    CLASSICAL_CHINESE_PROMPT_NOTES[normalizedSourceLanguage];
  const translationLanguageNotes = [
    ...new Set(
      translationLanguages.map((language) =>
        normalizeLanguageTag({
          language,
        }),
      ),
    ),
  ]
    .map(
      (language) => CLASSICAL_CHINESE_TRANSLATION_PROMPT_NOTES[language] ?? "",
    )
    .filter((note) => note.length > 0);

  return [sourceLanguageNote, ...translationLanguageNotes]
    .filter((note) => note && note.length > 0)
    .join("\n");
};
