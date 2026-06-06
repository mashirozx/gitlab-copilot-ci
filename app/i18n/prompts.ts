const CLASSICAL_CHINESE_PROMPT_NOTES: Record<string, string> = {
  "zh-lzh":
    "补充说明：这里的“文言文”指古典汉语书面语。在每条翻译中请使用简体汉字。",
  "zh-hans-lzh":
    "补充说明：这里的“文言文”指古典汉语书面语。在每条翻译中请使用简体汉字。",
  "zh-hant-lzh":
    "补充说明：这里的“文言文”指古典汉语书面语。在每条翻译中请使用繁體漢字。",
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
  return [sourceLanguage, ...translationLanguages]
    .map((language) =>
      normalizeLanguageTag({
        language,
      }),
    )
    .filter(
      (language, index, languages) => languages.indexOf(language) === index,
    )
    .map((language) => CLASSICAL_CHINESE_PROMPT_NOTES[language] ?? "")
    .filter(
      (note, index, notes) => note.length > 0 && notes.indexOf(note) === index,
    )
    .join("\n");
};
