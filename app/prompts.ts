import { REVIEW_RESPONSE_JSON_MARKER } from "./constants";
import type { StoredReview } from "./types/entities";

const buildTranslationsSpec = (langs: string[]): string => {
  if (langs.length === 0) return "";
  const fields = langs.map((lang) => `"${lang}": "string"`).join(", ");
  return `, "translations": { ${fields} }`;
};

const buildTranslationsSectionInstructions = (langs: string[]): string => {
  if (langs.length === 0) return "";

  return langs
    .map(
      (lang) => `

---

Then add a translated section for language "${lang}" using the same section structure, written entirely in ${lang}. Place it after the divider above. Use a heading like:
# 📝 Copilot Code Review (${lang})
Include translated equivalents of "## 📋 Pull Request Changes", "## 🔍 Review Summary", and "## 💡 Other Suggestions" section content.
The suggestions list should use the translations["${lang}"] values from the reviews.
The Other Suggestions section may be a bullet list, numbered list, or short paragraph, but it must stay in the comment markdown rather than the reviews JSON array.
If no suggestions, write the localized equivalent of "✨ No issues found!".`,
    )
    .join("");
};

export const buildCopilotPrompt = ({
  diffFilePath,
  title,
  description,
  previousReviews,
  langs,
  debugMode,
}: {
  diffFilePath: string;
  title: string;
  description?: string | null;
  previousReviews?: StoredReview[];
  langs: string[];
  debugMode: boolean;
}): string => {
  const mrDescription = description?.trim()
    ? `\n\n## Pull Request Description\n${description.trim()}`
    : "";

  const previousReviewsSection =
    previousReviews && previousReviews.length > 0
      ? `

## Previous Reviews (for validation - check if still applicable)

The following reviews were posted on this MR in previous runs. Please verify if each is still valid in the current diff.

- If a previous review is still valid and can be mapped to an exact valid current diff line, include it in the "reviews" array.
- If it remains conceptually valid but cannot be mapped to an exact valid current diff line, include it only in the comment's "## 💡 Other Suggestions" section, not in the "reviews" array.

${previousReviews
  .map(
    (review, idx) => `
### Previous Review ${idx + 1}
**File**: ${review.file_path}
**Line**: ${review.new_line}
**Suggestion**: ${review.suggestion}
**Context**:
\`\`\`
${review.source_snippet}
\`\`\`
`,
  )
  .join("\n")}
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
     - Look at the mr-diff.json above to see which files changed
     - For each changed file, use ONLY the line numbers that appear in the "new_line" field of the diff
     - The line number must be within the actual range of changed lines in that file
     - Example: If package.json has changes on lines 10-15, use one of those lines, NOT 136
      - If you cannot identify an exact valid changed line from the diff, do not emit that mock inline review; put it only in the "## 💡 Other Suggestions" section of the comment
  5. PREFIX each suggestion with "[MOCK] " at the beginning
  6. Must provide both "suggestion" and all requested translation fields with actual content (never empty).
  7. **IMPORTANT: The file_path and new_line must correspond to ACTUAL changes in the diff. GitLab will reject invalid line numbers.**
`
    : "";

  const translationsSpec = buildTranslationsSpec(langs);
  const translationsSections = buildTranslationsSectionInstructions(langs);

  const translationsNote =
    langs.length > 0
      ? `- For each review item, provide translations for: ${langs.join(", ")}`
      : "";

  const commentTemplate = `MUST use this exact template:\n\n# 📝 Copilot Code Review\n\n## 📋 Pull Request Changes\n[English description of what the PR changes]\n\n## 🔍 Review Summary\nFound X suggestion(s) from GitHub Copilot:\n\n[List of inline-review suggestions in English only, format: "- **file:line**: suggestion"]\n\nIf no suggestions, instead write: ✨ No issues found!\n\n## 💡 Other Suggestions\n[List any valid non-inline suggestions in English only. This can be a bullet list, numbered list, or short paragraph.]\n\nIf there are no other suggestions, write: None.${translationsSections}`;

  const guidelineFilesSection = `

Before reviewing code, check for repository guidance files that define agent or review behavior.

At minimum, look for these general instruction entry files if they exist:
- AGENTS.md
- CLAUDE.md
- .instructions.md
- copilot-instructions.md
- .cursorrules
- GEMINI.md

Also read any other clearly general repository-level LLM or agent guideline entry files you find.

If any of these files define merge request or code review rules, you must follow those rules for this review. Treat repository-specific merge request review instructions as higher priority than generic review habits.`;

  return `You are a senior code reviewer working in this repository.

Read-only task:
- Do not modify files
- Do not run mutating shell commands
- Read repository files only as needed for review context

## Pull Request Title
${title}${mrDescription}

First, read the merge request diff JSON from this file:
${diffFilePath}

That file contains the GitLab Merge Request diff payload. Use it to identify changed files and diff line numbers.${previousReviewsSection}${debugPrompt}

Then, inspect any repository files you need for context, including changed files, imported files, relevant skills/*/SKILL.md files, and repository guideline files.${guidelineFilesSection}

Analyze what this pull request changes and generate:
1. A summary comment in markdown with content in English${langs.length > 0 ? ` and the following languages (in this order): ${langs.join(", ")}` : ""}
2. JSON array with one object per inline review comment

Return only a JSON object with this structure:
{
  "comment": "${commentTemplate}",
  "reviews": [
    {
      "file_path": "string",
      "new_line": number,
      "suggestion": "string (English)"${translationsSpec}
    }
  ]
}

Notes:
- Each review will automatically be marked with: <!-- copilot-review-{file_path}:{line} -->
- Reviews marked with this will be automatically deleted if not resolved before next update

Rules:
- Keep suggestion and all translations aligned in meaning
- Only include actionable review findings
- Every review item in "reviews" must map to an exact valid line in the provided MR diff.
- Do not use absolute file line numbers in "reviews".
- Do not guess, approximate, or infer a nearby line number for "reviews".
- If a finding cannot be mapped to an exact valid diff line, keep it out of "reviews" and include it only in the comment's "## 💡 Other Suggestions" section.
- The "## 💡 Other Suggestions" section is part of the comment markdown only. Do not create any separate JSON field for it.
- The comment may include additional valid findings in "## 💡 Other Suggestions" even when they are not suitable for inline review comments.
${translationsNote}
- Output the JSON on a single line, minified (no newlines)
- Prefix the JSON line with: ${REVIEW_RESPONSE_JSON_MARKER}
- Do not include any extra prose before or after the JSON line
- Format the comment field as valid markdown ready to post as GitLab comment
- Follow the template structure exactly for consistency
- Respect repository instruction files you found, especially any merge request review-specific rules`;
};
