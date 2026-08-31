---
name: code-style-guideline
description: Code style rules and conventions for the gitlab-copilot-ci project
keywords:
  - code-style
  - arrow-function
  - named-params
  - typescript
---

# Code Style Guideline

## 1. Arrow Functions

Always use arrow functions. Never use `function` keyword declarations or `function` expressions.

```ts
// incorrect
function doSomething() {}
const doSomething = function() {}

// correct
const doSomething = () => {}
```

> This rule is also enforced by Biome: `style.useArrowFunction = "error"`.

## 2. Named Parameters for Named Functions

Named (const-assigned) functions with parameters **must** use a single destructured object parameter. This avoids confusion about parameter order and makes call sites self-documenting.

This rule applies **only to named functions** (i.e., `const func = ...`). Anonymous functions (callbacks, inline handlers) are exempt.

```ts
// incorrect
const func = (params1: string, params2: number) => {}

// correct
const func = ({ params1, params2 }: { params1: string; params2: number }) => {}
```

### Call Sites

Update call sites accordingly:

```ts
// incorrect
func("hello", 42)

// correct
func({ params1: "hello", params2: 42 })
```

### Exceptions

- Functions with **zero parameters** are exempt (`const fn = () => {}`).
- Functions with exactly **one parameter** may use a plain parameter if the meaning is unambiguous (e.g., `const parse = (input: string) => {}`).
- Callbacks / anonymous functions passed inline are exempt:
  ```ts
  array.map((item) => item.name)           // OK — anonymous
  array.find((n: { id: string }) => ...)   // OK — anonymous
  ```

> Biome does not currently have a built-in rule for this pattern. Enforce manually during code review.

## 3. Avoid Unnecessary `as` Type Casts

Do not use `as` to cast a value to a type it already has. Before adding a cast, verify the inferred type — if TypeScript already infers the correct type, omit the cast.

```ts
// incorrect — yargs already infers string for demandOption string options
const projectId = argv["project-id"] as string;
const langs = argv["lang"] as string[];

// correct — no cast needed
const projectId = argv["project-id"];
const langs = argv["lang"];
```

Use `as` only when genuinely narrowing or widening is required and the type cannot be inferred correctly otherwise (e.g., external JSON, opaque APIs, or intentional nominal typing). Always verify with `bun tsc` that removing the cast causes an error before keeping it.
