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

const buildDiffLineNumberGuidance = (): string => {
  return `

## How To Compute Correct Diff Line Numbers

Use this procedure exactly before emitting any item in "reviews":

1. Find the target file inside the provided mr-diff.page-*.diff files.
2. Read that file's diff hunk headers. A header looks like @@ -oldStart,oldCount +newStart,newCount @@.
3. Initialize two counters from the header:
   - oldLine = oldStart
   - newLine = newStart
4. Walk the hunk line by line after the header:
   - A line starting with a single space is context. It exists on both sides. After processing it, increment both oldLine and newLine.
   - A line starting with '-' is removed from the old file. That line maps to oldLine only. After processing it, increment oldLine only.
   - A line starting with '+' is added in the new file. That line maps to newLine only. After processing it, increment newLine only.
5. Never count the hunk header itself as a code line.
6. Never use a file's absolute line number unless you derived it from the diff hunk counters above.
7. For a review item:
   - set only "new_line" when the finding points at an added line
   - set only "old_line" when the finding points at a removed line
   - set both only when the finding truly refers to a valid paired old/new diff position
8. At least one of "new_line" or "old_line" must be present.
9. Also record the exact diff page file name in "diff_file" and the exact original diff line text in "diff_line_code".
10. "diff_line_code" must be the full line exactly as it appears in the diff file, including its leading diff marker (\` \`, \`+\`, or \`-\`).
11. If the same exact diff line text appears multiple times in the same diff file, keep citing the exact line text. The runtime will try later matches first for repeated citations, then wrap to earlier matches only if needed.
12. If you cannot compute an exact valid diff position from the hunk, do not emit that finding in "reviews". Put it only in the comment's "## 💡 Other Suggestions" section.

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
  previousReviews,
  langs,
  debugMode,
}: {
  diffFilePaths: string[];
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
**Line**: ${review.old_line ? `new ${review.new_line}, old ${review.old_line}` : review.new_line}
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
     - Follow the "How To Compute Correct Diff Line Numbers" section exactly
      - Use only files and diff positions that exist in the provided mr-diff.page-*.diff files
  5. PREFIX each suggestion with "[MOCK] " at the beginning
  6. Must provide both "suggestion" and all requested translation fields with actual content (never empty).
  7. **IMPORTANT: The file_path and any provided new_line/old_line values must correspond to ACTUAL changes in the diff. GitLab will reject invalid line numbers.**
`
    : "";

  const translationsSpec = buildTranslationsSpec(langs);
  const translationsSections = buildTranslationsSectionInstructions(langs);
  const diffLineNumberGuidance = buildDiffLineNumberGuidance();
  const diffFilesList = diffFilePaths
    .map((filePath) => `- ${filePath}`)
    .join("\n");

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

First, read the merge request diff from all of these files:
${diffFilesList}

These files together contain the full paginated GitLab Merge Request unified diff. Read all of them before deciding whether a file or diff line exists.${diffLineNumberGuidance}${previousReviewsSection}${debugPrompt}

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
      "diff_file": "mr-diff.page-N.diff",
      "diff_line_code": "string",
      "new_line"?: number,
      "old_line"?: number,
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
- Every review item in "reviews" must include "diff_file" and "diff_line_code".
- "diff_file" must be one of the provided diff page file names, using the file name form such as "mr-diff.page-1.diff".
- "diff_line_code" must be the exact original diff line text as it appears in that diff file, including the leading diff marker.
- Every review item in "reviews" must include at least one of "new_line" or "old_line".
- Every provided "new_line" or "old_line" value must map to an exact valid line in the provided MR diff.
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
