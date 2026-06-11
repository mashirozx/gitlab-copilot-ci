import { outputJsonPath } from "./constants";
import { buildSpecialLanguageInstructions } from "./i18n/prompts";
import { argv } from "./utils/argv";
import { getRequestedResponseLanguages } from "./utils/composers/review-comment-builder";
import { getPromptModelSpec } from "./utils/model-name-parser";

export const REVIEW_HISTORY_FILE_INTRO = `# Prior Inline Review History For Duplicate Suppression

Read this file only after you finish the actual code review and are about to build the final output JSON.

Use these review blocks only to remove duplicate inline review items that match the same issue on the same file and exact same old/new line pair.

Do not use this file to change the walkthrough, change summary, or other earlier analysis.`;

const buildLocalizedStringRecordSpec = ({
  languages,
}: {
  languages: string[];
}): string => {
  return languages.map((language) => `"${language}": "string"`).join(", ");
};

const buildLocalizedSuggestionsRecordSpec = ({
  languages,
}: {
  languages: string[];
}): string => {
  return languages
    .map(
      (language) =>
        `"${language}": { "detail": "string", "abstract": "string" }`,
    )
    .join(", ");
};

const buildLocalizedChangeRecordSpec = ({
  languages,
}: {
  languages: string[];
}): string => {
  return languages
    .map(
      (language) =>
        `"${language}": { "step": "string", "layers": [{ "title": "string", "files": ["string"], "summary": "string" }] }`,
    )
    .join(", ");
};

const buildDiffLineNumberGuidance = (): string => {
  return `

## How To Compute Correct Diff Line Numbers

Use this procedure exactly before emitting any item in "reviews":

- You may compute review positions with locally installed Node.js if that helps you derive exact diff positions. Prefer Node.js over Python or any other language runtime when you choose a local compute tool. Do not rely on non-Node external compute tools or vague estimation.

1. Find the target file inside the provided mr-diff.page-*.diff files.
2. Read that file's diff hunk headers. A header looks like @@ -oldStart,oldCount +newStart,newCount @@.
3. Initialize two counters from the header:
   - oldLine = oldStart
   - newLine = newStart
4. Walk the hunk line by line after the header:
   - A line starting with a single space is context. It exists on both sides. After processing it, increment both oldLine and newLine.
   - A line starting with '-' is removed from the old file. That line maps to oldLine only. After processing it, increment oldLine only.
   - A line starting with '+' is added in the new file. That line maps to newLine only. After processing it, increment newLine only.
5. If helpful, you may verify this counter walk with local Node.js code, but the final emitted positions must still match the provided diff text exactly.
6. Never count the hunk header itself as a code line.
7. Never use a file's absolute line number unless you derived it from the diff hunk counters above.
8. For a review item:
   - set only "new_line" when the finding points at an added line
   - set only "old_line" when the finding points at a removed line
   - set both only when the finding truly refers to a valid paired old/new diff position
9. At least one of "new_line" or "old_line" must be present.
10. Also record the exact diff page file name in "diff_file" and the exact original diff line text in "diff_line_code".
11. "diff_line_code" must be the full line exactly as it appears in the diff file, including its leading diff marker (\` \`, \`+\`, or \`-\`).
12. If the same exact diff line text appears multiple times in the same diff file, keep citing the exact line text. The runtime will try later matches first for repeated citations, then wrap to earlier matches only if needed.
13. If you cannot compute an exact valid diff position from the hunk, do not emit that finding in "reviews". Put it only in "summary.otherSuggestions".

Mini example:

@@ -10,3 +10,4 @@
 context A
-old call()
+new call()
 context B

Mapping:
- " context A" -> old_line 10, new_line 10
- "-old call()" -> old_line 11 only
- "+new call()" -> new_line 11 only
- " context B" -> old_line 12, new_line 12
`;
};

export const buildCopilotPrompt = ({
  diffFilePaths,
  title,
  description,
  reviewHistoryFilePath,
}: {
  diffFilePaths: string[];
  title: string;
  description?: string | null;
  reviewHistoryFilePath?: string;
}): string => {
  const hasReviewHistory = Boolean(reviewHistoryFilePath);
  const sourceLanguage = argv["thinking-lang"];
  const responseLanguages = getRequestedResponseLanguages({
    langs: argv["lang"],
    collapsedLangs: argv["collapsed-lang"],
    sourceLanguage,
  });
  const instructionFiles = argv["instruction-files"];
  const extraPrompts = argv["extra-prompts"]?.trim();
  const ignoredRanks = argv["ignored-rank"];
  const shouldTeachDiffCompute = argv["should-teach-diff-compute"];
  const configuredPromptModel = getPromptModelSpec({
    model: argv["model"],
  });
  const mrDescription = description?.trim()
    ? `\n\n## Pull Request Description\n${description.trim()}`
    : "";
  const responseLanguageRecordSpec = buildLocalizedStringRecordSpec({
    languages: responseLanguages,
  });
  const suggestionRecordSpec = buildLocalizedSuggestionsRecordSpec({
    languages: responseLanguages,
  });
  const changesRecordSpec = buildLocalizedChangeRecordSpec({
    languages: responseLanguages,
  });

  const reviewHistorySection = hasReviewHistory
    ? `

## Deferred Previous Inline Review History

A markdown file containing documented prior-review blocks is available at:
- ${reviewHistoryFilePath}

- Do not read or use this history file during the initial diff review, repository walkthrough, or first-pass finding generation.
- Complete the actual code review first based on the diff and repository context.
- Only after you have a candidate final payload, and immediately before constructing the output JSON, read this markdown history file and use it only for duplicate suppression.
- Remove only duplicate inline review items where the same issue is already covered on the same file and exact same old/new line pair.
- If a similar issue appears on a different file or different line pair, you should still keep it as a new review item.
- If you are unsure whether a history item describes the same issue, prefer treating it as different instead of suppressing a new finding.
- Each prior-review block includes a small "Diff" table and a freeform "Suggestions" section so rich markdown suggestions remain readable.
- The history file intentionally omits discussion ids and note ids because they are not relevant to duplicate detection.
- After removing duplicates, ensure the final "reviews" array is the only deduplicated output surface. Do not let this deferred history check change the walkthrough, changes list, or other suggestions beyond omitting duplicate inline findings from the final output.
`
    : "";

  const thinkingLanguageInstructions = buildSpecialLanguageInstructions({
    sourceLanguage,
    translationLanguages: responseLanguages,
  });
  const diffLineNumberGuidance = shouldTeachDiffCompute
    ? buildDiffLineNumberGuidance()
    : "";
  const diffFilesList = diffFilePaths
    .map((filePath) => `- ${filePath}`)
    .join("\n");

  const instructionEntryFilesSection =
    instructionFiles.length > 0
      ? `At minimum, look for these general instruction entry files:\n${instructionFiles
          .map((filePath) => `- ${filePath}`)
          .join("\n")}`
      : `At minimum, look for these general instruction entry files:\n- AGENTS.md\n- CLAUDE.md\n- .instructions.md\n- copilot-instructions.md\n- .cursorrules\n- GEMINI.md`;

  const ignoredRankInstruction =
    ignoredRanks.length > 0
      ? `- Filter out any findings ranked as: ${ignoredRanks.join(", ")}. Do not include those ranks in either "summary" or "reviews".`
      : `- No review-rank filtering is active. HIGH, MEDIUM, and LOW findings may all be included.`;

  const guidelineFilesSection = `

Before reviewing code, check for repository guidance files that define agent or review behavior.

${instructionEntryFilesSection}

Also read any other clearly general repository-level LLM or agent guideline entry files you find.

If any of these files define merge request or code review rules, you must follow those rules for this review. Treat repository-specific merge request review instructions as higher priority than generic review habits.`;

  const extraPromptsSection = extraPrompts
    ? `

Additional required instructions:

${extraPrompts}

You must obey the additional required instructions above unless they conflict with higher-priority system or repository rules.`
    : "";

  const configuredModelSection = configuredPromptModel.model
    ? `- The configured runtime model string for this review is "${configuredPromptModel.model}". You are being called by an agent with this model string already set.
- Use this configured runtime model string as the source of truth for the human-readable model name in "readableModelName" instead of guessing from runtime self-identification.`
    : "";

  const outputJsonInstruction = `- Write the final JSON directly to this file using Node.js: ${outputJsonPath}`;

  return `You are a senior code reviewer working in this repository.

Read-only task:
- Do not modify files
- Do not run mutating shell commands
- Read repository files only as needed for review context

Reasoning-language requirement:
- From the very beginning of this task, immediately after receiving this prompt, think in ${sourceLanguage}.
- At the beginning of your reasoning, first translate the relevant task instructions in this prompt into ${sourceLanguage} for your own working understanding.
- After that translation step, base all subsequent reasoning, analysis, and planning on that translated prompt in ${sourceLanguage}.
- If your runtime exposes any visible thinking, reasoning, planning, or step-by-step analysis before the final answer, emit that visible thinking in ${sourceLanguage} as well.
- Do not switch visible reasoning to another language unless a higher-priority instruction explicitly requires it.
- Do not rewrite visible thinking, markdown output, or JSON string content with Unicode escape encoding such as \\uXXXX when normal UTF-8 characters can be used directly.
- Prefer direct UTF-8 characters in visible thinking and in the final JSON string values whenever valid JSON allows it.

## Pull Request Title
${title}${mrDescription}

First, read the merge request diff from all of these files:
${diffFilesList}

These files together contain the full paginated GitLab Merge Request unified diff. Read all of them before deciding whether a file or diff line exists.${diffLineNumberGuidance}${reviewHistorySection}

Then, inspect any repository files you need for context, including changed files, imported files, relevant skills/*/SKILL.md files, and repository guideline files.${guidelineFilesSection}
${extraPromptsSection}

Analyze what this pull request changes and generate:
1. "readableModelName": the human-friendly model name that the runtime will embed into the final summary title.
2. "summary.walkthrough": brief markdown walkthrough content for every requested language.
3. "summary.changes": structured step/layer/file data for every requested language.
4. "summary.otherSuggestions": markdown content for valid non-inline feedback in every requested language.
5. "reviews": one JSON object per inline review comment, each with per-language detail and abstract suggestion text.

Return only a JSON object with this structure:
{
  "readableModelName": "string",
  "summary": {
    "walkthrough": { ${responseLanguageRecordSpec} },
    "changes": [
      { ${changesRecordSpec} }
    ],
    "otherSuggestions": { ${responseLanguageRecordSpec} }
  },
  "reviews": [
    {
      "file_path": "string",
      "diff_file": "mr-diff.page-N.diff",
      "diff_line_code": "string",
      "new_line"?: number,
      "old_line"?: number,
      "rank": "HIGH | MEDIUM | LOW",
      "suggestions": { ${suggestionRecordSpec} }
    }
  ]
}

Notes:
- Each review will automatically be marked with: <!-- copilot-review-{file_path}:{line} -->

Rules:
- Use the configured runtime model string provided below as the source of truth for "readableModelName" instead of guessing from runtime self-identification.${
    configuredModelSection
      ? `
${configuredModelSection}`
      : ""
  }
- CRITICAL NOMENCLATURE RULE: Only omit the tier modifier if the model is the true base, standard, or full-sized variant. If you are a specialized variant (like mini, nano, flash, pro, or thinking), you MUST append your tier modifier (e.g., 'gpt-5.4-mini', 'gemini-3.5-flash'). Never omit 'mini' if you are a mini model.
- If you choose any local scripted operation or compute tool during review, prefer Node.js over Python or other language runtimes.
- Set "readableModelName" to the final human-readable model display name using Title Case with space separation (e.g., "GPT-5.4 mini", "Gemini 3.5 Flash"). If and only if you are the standard/base model, drop the tier suffix (e.g., use "GPT-5.4", not "GPT-5.4 Base").
- Start reasoning in ${sourceLanguage} immediately when this prompt begins, before reading diffs or repository files.
- At the start of reasoning, translate the prompt instructions you rely on into ${sourceLanguage} for internal use before continuing the task.
- After translating those prompt instructions, keep all further reasoning grounded in that ${sourceLanguage} translation rather than switching back to another-language interpretation.
- If the runtime shows your thinking before the final JSON line, keep that visible thinking entirely in ${sourceLanguage}.
- Do not convert visible thinking, markdown, or JSON string values into Unicode escape sequences such as \\uXXXX unless JSON syntax requires escaping a specific character.
- Use normal UTF-8 characters directly in the final output whenever possible.
- ${thinkingLanguageInstructions || "Keep the requested thinking language consistent across the full review output."}
- Include every requested language in every language-keyed record: ${responseLanguages.join(", ")}.
- Keep the meaning aligned across all languages for each walkthrough entry, each change step, each other-suggestions entry, and each review suggestion.
- "summary.walkthrough[lang]" must be plain markdown body content only. Do not add section titles or outer template markup.
- Each item in "summary.changes" is one logical implementation step. The same array item must describe the same step across all requested languages.
- Each "summary.changes[*][lang].step" must be a short step title.
- Each "summary.changes[*][lang].layers[*].files" entry must be plain file or path text only, with no markdown formatting.
- Each "summary.changes[*][lang].layers[*].summary" may use light markdown, but it must describe what actually changed, not the final comment template.
- "summary.otherSuggestions[lang]" must be markdown body content only, with no heading. If there are no other suggestions in that language, write a brief localized sentence such as "✨ I have no feedback to provide.".
- Every review item in "reviews" must include a rank of HIGH, MEDIUM, or LOW.
- For every review item, include all requested languages inside "suggestions".
- "reviews[*].suggestions[lang].detail" is the inline-review body only. It should explain what is wrong, why it matters, and how to improve it. Do not include rank badges, model names, headings, outer wrappers, or translated language headers there.
- "reviews[*].suggestions[lang].abstract" must be a brief one-sentence summary suitable for a bullet list in the runtime-rendered summary comment.
- Do not embed rank flag markup into any field. Keep the structured "rank" field separate and let the runtime render badges.
- Only include actionable review findings.
- Every review item in "reviews" must include "diff_file" and "diff_line_code".
- "diff_file" must be one of the provided diff page file names, using the file name form such as "mr-diff.page-1.diff".
- "diff_line_code" must be the exact original diff line text as it appears in that diff file, including the leading diff marker.
- Every review item in "reviews" must include at least one of "new_line" or "old_line".
- Every provided "new_line" or "old_line" value must map to an exact valid line in the provided MR diff.
- Do not use absolute file line numbers in "reviews".
- Do not guess, approximate, or infer a nearby line number for "reviews".
- If a finding cannot be mapped to an exact valid diff line, keep it out of "reviews" and include it only in "summary.otherSuggestions" for every requested language.
- Do not generate the final GitLab comment template yourself. The runtime will apply the summary title, walkthrough heading, changes heading, review-summary heading, rank badges, tables, and collapsed translation blocks.
${ignoredRankInstruction}
- If a deferred previous-inline-review history file is provided above, read it only at the final JSON-construction step. Prefer reading and applying that duplicate filter with local Node.js immediately before serializing the payload.
- Before emitting the final response, construct the full JSON payload with local Node.js and serialize it with Node's JSON.stringify(). Prefer this over hand-writing JSON text.
- If the Node.js step throws any syntax, reference, or serialization error, fix the payload immediately and rerun the same Node.js JSON.stringify() step until it succeeds.
- If you loaded the deferred history file, finish filtering duplicate inline review items before this JSON.stringify() step.
${outputJsonInstruction}
- Use Node.js fs.writeFileSync() to write the JSON output to that file path.
- The JSON output does not need to be minified.
- After writing the file successfully, do not output the JSON in the final response message. The runtime will read the file directly.
- Do not wrap the JSON with markers. Write only the JSON object to the file, nothing else.
- Respect repository instruction files you found, especially any merge request review-specific rules.`;
};
