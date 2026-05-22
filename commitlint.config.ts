import type { UserConfig } from "@commitlint/types";

const startsWithEmoji = (text: string): boolean => {
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?\s+/u.test(
    text,
  );
};

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "subject-emoji-required": (parsed) => {
          const subject = parsed.subject ?? "";
          const passes = startsWithEmoji(subject);
          return [
            passes,
            "commit subject must start with an emoji followed by a space, e.g. 'perf: ⚡ improve option clarity'",
          ];
        },
      },
    },
  ],
  rules: {
    "subject-emoji-required": [2, "always"],
  },
};

export default Configuration;
