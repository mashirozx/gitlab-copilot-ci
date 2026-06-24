import { t } from "../../i18n";
import { buildJobDetailUrl } from "./comment-helper";

export const buildCriticalErrorBlock = ({
  language,
}: {
  language: string;
}): string => {
  const jobDetailUrl = buildJobDetailUrl();
  const content = jobDetailUrl
    ? t("reviewSummary.criticalError.messageWithLinks", {
        lang: language,
        linkToJobDetail: jobDetailUrl,
      })
    : t("reviewSummary.criticalError.message", {
        lang: language,
      });

  return `> [!warning] ${content}`;
};

export const buildSummaryLanguageBlockWithCriticalError = ({
  readableModelName,
  language,
}: {
  readableModelName: string;
  language: string;
}): string => {
  return [
    `# ${t("reviewSummary.title", { readableModelName, lang: language })}`,
    buildCriticalErrorBlock({
      language,
    }),
  ].join("\n\n");
};
