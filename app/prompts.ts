import {
  REVIEW_RESPONSE_JSON_END_MARKER,
  REVIEW_RESPONSE_JSON_START_MARKER,
} from "./constants";
import { argv } from "./utils/argv";
import { buildCurrentCommitReference } from "./utils/commit-reference";
import { getPromptModelSpec } from "./utils/model-name-parser";
import {
  buildDetailsBlock,
  getPromptTranslationLangs,
  getRankInlineMath,
  isSameLanguage,
} from "./utils/review-output";

export const REVIEW_SUMMARY_TITLE = `# 📝 Code Review Summary by \${LLM name}`;
export const REVIEW_SUMMARY_TITLE_TEXT = `Code Review Summary by \${LLM name}`;
export const REVIEW_HISTORY_FILE_INTRO = `# Prior Inline Review History For Duplicate Suppression

Read this file only after you finish the actual code review and are about to build the final output JSON.

Use these review blocks only to remove duplicate inline review items that match the same issue on the same file and exact same old/new line pair.

Do not use this file to change the walkthrough, change summary, or other earlier analysis.`;

const buildTranslationsSpec = (langs: string[]): string => {
  if (langs.length === 0) return "";
  const fields = langs.map((lang) => `"${lang}": "string"`).join(", ");
  return `, "translations": { ${fields} }`;
};

const buildTranslationsSectionInstructions = ({
  langs,
  hasReviewHistory,
  sourceLanguage,
}: {
  langs: string[];
  hasReviewHistory: boolean;
  sourceLanguage: string;
}): string => {
  if (langs.length === 0) return "";

  const reviewSummaryTitleTemplate = REVIEW_SUMMARY_TITLE_TEXT;
  const reviewSummaryHistoryNote = hasReviewHistory
    ? buildReviewHistoryExclusionNote()
    : "";

  return langs
    .map(
      (lang) => `

For "summary.translations["${lang}"]", return a complete markdown block using the same section structure, written entirely in ${lang}. Use a heading like:
# 📝 [translated equivalent of "${reviewSummaryTitleTemplate}"] (${lang})
Keep the markdown heading prefix exactly as "# 📝 ". Do not translate, duplicate, remove, or add markdown symbols, heading markers, or emoji in the title line. Translate only the human-language title text after that prefix.
Translate the original ${sourceLanguage} "summary.content" markdown block into ${lang} while preserving its section structure. If the source template uses a plain "##" heading for a section, keep a translated "##" heading there. If the source template uses a <details> block for a section, keep the same <details>/<summary> HTML structure there and translate only the visible summary label and section body.
Include translated equivalents of the Walkthrough, Changes, Review Summary, and Other Suggestions section content.
The suggestions list should use the translations["${lang}"] values from the reviews.
Keep the markdown commit reference from the original "summary.content" unchanged and translate only the surrounding prose.
${reviewSummaryHistoryNote ? `After the inline-review list, keep the same separator and subscript note structure as "${reviewSummaryHistoryNote}", translated naturally while preserving the HTML and markdown structure.` : ""}
The Other Suggestions section may be a bullet list, numbered list, or a short paragraph, but it must remain in the comment markdown rather than the reviews JSON array.
If there are no suggestions, write the localized equivalent of "✨ No issues found!".`,
    )
    .join("");
};

const buildReviewSummaryLeadLine = ({
  sourceLanguage,
}: {
  sourceLanguage: string;
}): string => {
  if (
    isSameLanguage({
      left: sourceLanguage,
      right: "en",
    })
  ) {
    return `Found X review suggestion(s) in the changes up to ${buildCurrentCommitReference()}:`;
  }

  return `[In ${sourceLanguage}, state how many review suggestions were found in the changes up to ${buildCurrentCommitReference()}. Keep the markdown commit reference unchanged.]`;
};

const buildReviewHistoryExclusionNote = (): string => {
  return "<sub>Suggestions from previous review runs are not listed here.</sub>";
};

const buildTranslatedRankFlagInstructions = (): string => {
  return `- In every value in "summary.translations", keep the same LaTeX rank-badge template and color as the matching English flag, but translate only the rank word inside \\text{...} into that target language.
  - HIGH example: ${getRankInlineMath({ rank: "HIGH", label: "[translated HIGH]" })}
  - MEDIUM example: ${getRankInlineMath({ rank: "MEDIUM", label: "[translated MEDIUM]" })}
  - LOW example: ${getRankInlineMath({ rank: "LOW", label: "[translated LOW]" })}`;
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
13. If you cannot compute an exact valid diff position from the hunk, do not emit that finding in "reviews". Put it only in the comment's "## 💡 Other Suggestions" section.

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

const buildChangesSummaryTemplate = (): string => {
  const heading = "## 🚧 Changes";
  const content = `[Break the merge request into key steps. For each step, start with a short bold title, then add a two-column markdown table with "Layer / File(s)" and "Summary". In the left column, name the relevant layer, module, or method and list the touched file paths. In the right column, describe what actually changed for that step.]

[Example structure for one step:]
**Step title**

| Layer / File(s) | Summary |
| --- | --- |
| **name or desc of module, method, or larger feature**  <br> \`path/to/file.rs\`, \`path/to/file.ts\` | What actually changed |

[Repeat for additional steps when needed.]`;

  if (argv["collapse-changes-summary"]) {
    return `${heading}\n\n${buildDetailsBlock({
      summary: "Details",
      content,
    })}`;
  }

  return `${heading}\n\n${content}`;
};

const buildReviewSummaryTemplate = ({
  hasReviewHistory,
  sourceLanguage,
}: {
  hasReviewHistory: boolean;
  sourceLanguage: string;
}): string => {
  const heading = "## 🔍 Review Summary";
  const historyNote = hasReviewHistory
    ? `\n\n***\n\n${buildReviewHistoryExclusionNote()}`
    : "";
  const content = `${buildReviewSummaryLeadLine({ sourceLanguage })}

[List of inline-review suggestions in ${sourceLanguage} only, format: "- file:line: rank_flag suggestion"]

If no suggestions, instead write: ✨ No issues found!
${historyNote}`;

  if (argv["collapse-review-summary"]) {
    return `${heading}\n\n${buildDetailsBlock({
      summary: "Details",
      content,
    })}`;
  }

  return `${heading}\n\n${content}`;
};

export const buildCopilotPrompt = ({
  diffFilePaths,
  title,
  description,
  reviewHistoryFilePath,
  debugMode,
}: {
  diffFilePaths: string[];
  title: string;
  description?: string | null;
  reviewHistoryFilePath?: string;
  debugMode: boolean;
}): string => {
  const hasReviewHistory = Boolean(reviewHistoryFilePath);
  const sourceLanguage = argv["thinking-lang"];
  const langs = getPromptTranslationLangs({
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
- After removing duplicates, update the final inline-review list and X count inside "summary.content" and every translated summary block so they match the filtered final "reviews" array exactly.
- Do not let this deferred history check change the walkthrough, changes summary, or any other earlier analysis beyond omitting duplicate inline findings from the final output.
`
    : "";

  const debugPrompt = debugMode
    ? `

## Debug Mode - ONLY Generate Mock Reviews (NO Real Analysis)

- You are running in debug mode. This is a TEST MODE ONLY.
- **DO NOT perform any real code review.** Do not analyze the diff at all.
- **DO NOT read any repository files** - no read_file, list_directory, search_files, or grep tools.
- **Generate ONLY MOCK content** to test the system workflow.

- Instead of a real code review, generate 2-3 MOCK review comments. Each mock review should:
  1. Use a random poem, literary quote, or general life saying (NOT programming-related)
  2. Include the author or source at the end (e.g., "- Jane Austen" or "- Unknown")
  3. Avoid any political, religious, or sensitive topics
  4. **CRITICAL - Pick VALID file and line from the diff:**
      - ${shouldTeachDiffCompute ? 'Follow the "How To Compute Correct Diff Line Numbers" section exactly' : "Derive valid positions from the diff text. You may use local Node.js if needed, but do not guess or use non-Node external compute tools."}
      - Use only files and diff positions that exist in the provided mr-diff.page-*.diff files
  5. PREFIX each suggestion with "[MOCK] " at the beginning
  6. Must provide both "suggestion" and all requested translation fields with actual content (never empty).
  7. **IMPORTANT: The file_path and any provided new_line/old_line values must correspond to ACTUAL changes in the diff. GitLab will reject invalid line numbers.**
`
    : "";

  const translationsSpec = buildTranslationsSpec(langs);
  const translationsSections = buildTranslationsSectionInstructions({
    langs,
    hasReviewHistory,
    sourceLanguage,
  });
  const reviewSummaryTitleTemplate = REVIEW_SUMMARY_TITLE;
  const diffLineNumberGuidance = shouldTeachDiffCompute
    ? buildDiffLineNumberGuidance()
    : "";
  const diffFilesList = diffFilePaths
    .map((filePath) => `- ${filePath}`)
    .join("\n");

  const translationsNote =
    langs.length > 0
      ? `- For each review item, provide translations for: ${langs.join(", ")}`
      : "";
  const translatedRankFlagInstructions =
    langs.length > 0 ? buildTranslatedRankFlagInstructions() : "";

  const walkthroughSectionTemplate = `## 📋 Walkthrough
[Write a ${sourceLanguage} walkthrough that explains the merge request's goal and how the implementation is built step by step.]`;

  const otherSuggestionsSectionTemplate = `## 💡 Other Suggestions
[List any valid non-inline suggestions in ${sourceLanguage} only. This can be a bullet list, numbered list, or short paragraph.]

If there are no other suggestions, write: ✨ I have no feedback to provide.`;

  const summaryTemplate = `MUST use this exact template:

${reviewSummaryTitleTemplate}

${walkthroughSectionTemplate}


${buildChangesSummaryTemplate()}

${buildReviewSummaryTemplate({
  hasReviewHistory,
  sourceLanguage,
})}

${otherSuggestionsSectionTemplate}`;

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
- Use this configured runtime model string as the source of truth for the human-readable model display name in the summary title instead of guessing from runtime self-identification.`
    : "";

  return `You are a senior code reviewer working in this repository.

Read-only task:
- Do not modify files
- Do not run mutating shell commands
- Read repository files only as needed for review context

## Pull Request Title
${title}${mrDescription}

First, read the merge request diff from all of these files:
${diffFilesList}

These files together contain the full paginated GitLab Merge Request unified diff. Read all of them before deciding whether a file or diff line exists.${diffLineNumberGuidance}${reviewHistorySection}${debugPrompt}

Then, inspect any repository files you need for context, including changed files, imported files, relevant skills/*/SKILL.md files, and repository guideline files.${guidelineFilesSection}
${extraPromptsSection}

Analyze what this pull request changes and generate:
1. A structured summary object whose "content" is always markdown in ${sourceLanguage}${langs.length > 0 ? ` and whose "translations" object contains translated summary markdown blocks keyed by language: ${langs.join(", ")}` : ""}
2. JSON array with one object per inline review comment

Return only a JSON object with this structure:
{
  "summary": {
    "content": "${summaryTemplate}",
    "translations": { ${langs.map((lang) => `"${lang}": "string"`).join(", ")} }
  },
  "reviews": [
    {
      "file_path": "string",
      "diff_file": "mr-diff.page-N.diff",
      "diff_line_code": "string",
      "new_line"?: number,
      "old_line"?: number,
      "rank": "HIGH | MEDIUM | LOW",
      "suggestion": "string (${sourceLanguage})"${translationsSpec}
    }
  ]
}

Notes:
- Each review will automatically be marked with: <!-- copilot-review-{file_path}:{line} -->

Rules:
- Use the configured runtime model string provided below as the source of truth for the summary title's human-readable model display name instead of guessing from runtime self-identification.${
    configuredModelSection
      ? `
${configuredModelSection}`
      : ""
  }
- CRITICAL NOMENCLATURE RULE: Only omit the tier modifier if the model is the true base, standard, or full-sized variant. If you are a specialized variant (like mini, nano, flash, pro, or thinking), you MUST append your tier modifier (e.g., 'gpt-5.4-mini', 'gemini-3.5-flash'). Never omit 'mini' if you are a mini model.
- If you choose any local scripted operation or compute tool during review, prefer Node.js over Python or other language runtimes.
- In the title of "summary.content" and every value in "summary.translations", replace "\${LLM name}" with the full, human-readable model display name using Title Case with space separation (e.g., "GPT-5.4 mini", "Gemini 3.5 Flash"). If and only if you are the standard/base model, drop the tier suffix (e.g., use "GPT-5.4", not "GPT-5.4 Base").
- The full human-readable model display name must appear in the summary title. Do not add any separate JSON field for model or effort output.
- In every summary title, keep the exact markdown prefix "# 📝 " and do not translate or duplicate markdown symbols or emoji. Translate only the natural-language title text after that prefix when needed.
- Always write "summary.content" and every review item's "suggestion" in ${sourceLanguage}, regardless of --lang or --collapsed-lang.
- Any requested language other than ${sourceLanguage} must be returned only inside the JSON translation fields.
- If a requested display language matches ${sourceLanguage}, do not include that language in any translations object; the runtime will read that language directly from "summary.content" or "suggestion".
- Keep suggestion and all translations aligned in meaning
- Every review item in "reviews" must include a rank of HIGH, MEDIUM, or LOW.
- Do not embed the rank flag markup into "suggestion" or translation text. Keep the structured "rank" field separate.
- In "summary.content" and every value in "summary.translations", every inline-review bullet must include the rank flag that matches the review item's rank before the review text.
- Use these exact rank flags inside "summary.content":
  - HIGH: ${getRankInlineMath({ rank: "HIGH" })}
  - MEDIUM: ${getRankInlineMath({ rank: "MEDIUM" })}
  - LOW: ${getRankInlineMath({ rank: "LOW" })}
- In "summary.content", keep the rank words in ${sourceLanguage}.
${translatedRankFlagInstructions}
- Only include actionable review findings
- Every review item in "reviews" must include "diff_file" and "diff_line_code".
- "diff_file" must be one of the provided diff page file names, using the file name form such as "mr-diff.page-1.diff".
- "diff_line_code" must be the exact original diff line text as it appears in that diff file, including the leading diff marker.
- Every review item in "reviews" must include at least one of "new_line" or "old_line".
- Every provided "new_line" or "old_line" value must map to an exact valid line in the provided MR diff.
- Do not use absolute file line numbers in "reviews".
- Do not guess, approximate, or infer a nearby line number for "reviews".
- If a finding cannot be mapped to an exact valid diff line, keep it out of "reviews" and include it only in the comment's "## 💡 Other Suggestions" section.
- The "## 💡 Other Suggestions" section must stay inside the markdown in "summary.content" and translated summary blocks, not as a separate JSON field.
- The summary may include additional valid findings in "## 💡 Other Suggestions" even when they are not suitable for inline review comments.
${ignoredRankInstruction}
${translationsNote}
${translationsSections}
- If a deferred previous-inline-review history file is provided above, read it only at the final JSON-construction step. Prefer reading and applying that duplicate filter with local Node.js immediately before serializing the payload.
- Before emitting the final response, construct the full JSON payload with local Node.js and serialize it with Node's JSON.stringify(). Prefer this over hand-writing JSON text.
- If the Node.js step throws any syntax, reference, or serialization error, fix the payload immediately and rerun the same Node.js JSON.stringify() step until it succeeds.
- If you loaded the deferred history file, finish filtering duplicate inline review items before this JSON.stringify() step and ensure the final summary review list/counts match the filtered payload.
- Only after Node.js successfully prints valid minified JSON may you wrap it with the start/end markers and return it.
- A valid workflow is: build the full payload as a JavaScript object in Node.js, run JSON.stringify(payload), inspect any thrown error, correct the object, and rerun until JSON.stringify(payload) succeeds.
- Output the JSON on a single line, minified (no newlines)
- Wrap the JSON like this: ${REVIEW_RESPONSE_JSON_START_MARKER}{...}${REVIEW_RESPONSE_JSON_END_MARKER}
- First output the start marker, then the minified JSON object, then the end marker, all on one line
- Do not include any extra prose before or after the wrapped JSON line
- Format "summary.content" and each value in "summary.translations" as valid markdown ready to post as GitLab comment content
- Follow the template structure exactly for consistency
- Respect repository instruction files you found, especially any merge request review-specific rules`;
};
