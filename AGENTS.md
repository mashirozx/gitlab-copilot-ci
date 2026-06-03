This is a Bun-based shell application.

# Features

This app is compiled into a binary file. During merge request CI runs on a CI server, the binary is invoked from the project root with necessary GitLab and GitHub Copilot API tokens passed as environment variables. The binary retrieves the changed files and their diffs, then sends them to GitHub Copilot for review. Finally, the binary posts the review comments back to GitLab.

# Guidelines

- Install dependencies with locked versions: e.g., `bun install -E package`.
- Follow code style rules in `skills/code-style-guideline/SKILL.md` (arrow functions, named params).
- See `skills/project-guideline/SKILL.md` for complete project structure, development guidelines, and LLM maintenance instructions.
- See `skills/karpathy-guidelines/SKILL.md` for advanced coding practices and patterns.

## LLM Behavior Rule

**At the beginning of each response**, the LLM must explicitly state:
> I acknowledge and will follow the LLM rules defined in `AGENTS.md` and other project guideline files.

This statement confirms that the LLM has read and understands the project guidelines, code style requirements, and maintenance instructions before proceeding with any task.

# LLM Maintenance Instruction

**IMPORTANT**: Whenever you implement a new feature, fix a bug that affects behavior, or change the project structure:

1. **Update `skills/project-guideline/SKILL.md`** to reflect the change
2. **Include in the skill**:
   - New CLI arguments (with defaults and descriptions)
   - New SQLite tables or schema changes
   - New runtime behavior or workflow changes
   - New terminology or concepts
   - Updated file paths or module organization
3. **Update `README.md` whenever CLI arguments change** so the published options documentation stays in sync with `app/utils/argv.ts`
4. **Keep the skill accurate and complete** — future LLMs will rely on it for context

This ensures all team members (human and AI) have a single source of truth for how the project works.
