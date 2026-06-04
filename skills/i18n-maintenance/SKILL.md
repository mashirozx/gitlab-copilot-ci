---
name: i18n-maintenance
description: Add or update internal translation keys in app/i18n with minimal churn and full locale coverage
keywords:
  - i18n
  - translations
  - locale-keys
  - placeholder-interpolation
---

# I18n Maintenance SKILL

Use this skill when a task requires adding or changing internal runtime translations in `app/i18n/`.

## Rules

- Only change existing translations when the user explicitly asks for a wording change, a translation key changes, or a placeholder bug makes the current value incorrect.
- If the user asks for a new user-facing string and does not provide a key, choose the most reasonable nested key based on the owning feature area.
- When adding a new key, add it to the English source dictionary first, then add the same key to every bundled locale: `en`, `zh`, `zh-TW`, `zh-HK`, `zh-Hans`, `zh-Hant`, `zh-lzh`, `zh-Hans-lzh`, `zh-Hant-lzh`, `ja`, `de`, `fr`, `es`, `it`, `pt`, `ru`, `ko`, `th`, `fa`, `ar`, `id`, `ms`, `ta`.
- Keep placeholder names identical across all locales. If the English interpolation function receives `{ commitReference }`, every translation for that key must use that same parameter name exactly.
- For pluralized entries, keep the plural-driving parameter name aligned with the English source locale. The current pluralized runtime API expects `t(key, { count })`, so plural branch functions should use `{ count }` unless the English source key changes.
- After changing keys or placeholders, update `app/i18n/index.tst.ts` so the `tstyche` checks still cover the intended API and catch typos. Prefer real `tstyche` assertions such as `expect<TranslationKey>().type.toBe<...>()` for exact key unions and `expect(t).type.toBeCallableWith(...)` / `.not.toBeCallableWith(...)` for placeholder-object names instead of relying mainly on plain assignments plus `@ts-expect-error`.
- Keep locale definitions in their own files under `app/i18n/locales/`, for example `app/i18n/locales/zh.ts` or `app/i18n/locales/zh-TW.ts`, rather than re-inlining them into `app/i18n/index.ts`.
- Define interpolated translations as functions, for example `body: ({ commitReference }) => ...`, instead of placeholder strings.
- Define pluralized translations as branch objects in the locale files so the full sentence can change by category, for example `waitingForOtherReview: { zero: "...", one: ({ count }) => ... , other: ({ count }) => ... }`.
- `app/i18n/index.ts` now exposes `initI18n()` for the one-time async locale load. Callers should await that at startup and then use synchronous `t(...)` calls afterward.
- Internal console log strings are not currently localized; keep translation work focused on user-facing GitLab note content unless the user explicitly asks to expand that surface.
- Bun `Intl` does not recognize `zh-lzh`, `zh-Hans-lzh`, or `zh-Hant-lzh`, so any display-name or plural-selection logic that touches those tags needs a fallback path rather than assuming Intl support.
- Prefer adding the smallest necessary translation surface. Do not mass-rewrite unrelated locale entries.

## Key Naming

- Use nested keys grouped by feature ownership, for example `reviewProcess.reviewingMarker.queueNotice`.
- Prefer stable semantic names over wording-based names so future copy edits do not require key renames.

## Plurals

- Treat plural branch objects as leaf values, not nested translation namespaces. Do not call `t("some.key.other")`.
- `zero` may use a completely different sentence. Keep that wording inside the locale file rather than constructing it in feature code.
- `other` must exist for every pluralized key. Add `one`, `two`, `few`, or `many` only when the language needs them.

## Validation

- Run the narrow runtime tests for the touched caller.
- Run `bun run typecheck` after any key or placeholder change. `tstyche` auto-discovers `*.tst.ts` files, so keep new type-only coverage in that pattern.
