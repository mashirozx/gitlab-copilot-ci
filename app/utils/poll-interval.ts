export const DEFAULT_PENDING_CHECK_INTERVAL_MS = 10_000;
export const DEFAULT_REVIEW_MAX_PENDING_TIME_MS = 30 * 60_000;

export const parsePollInterval = ({
  value,
  optionName,
}: {
  value: string | undefined;
  optionName: string;
}): number => {
  if (value === undefined) {
    throw new Error(`${optionName} is required`);
  }

  const match = value
    .trim()
    .match(/^(\d+)\s*(ms|milliseconds|s|seconds|minutes|m)$/iu);

  if (!match) {
    throw new Error(
      `${optionName} must use an integer duration like 250ms, 10s, 30seconds, or 2minutes`,
    );
  }

  const numericValue = Number.parseInt(match[1] ?? "", 10);
  const unit = (match[2] ?? "").toLowerCase();

  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${optionName} must be a positive integer duration`);
  }

  if (unit === "ms" || unit === "milliseconds") {
    return numericValue;
  }

  if (unit === "s" || unit === "seconds") {
    return numericValue * 1000;
  }

  return numericValue * 60_000;
};

export const formatPollInterval = ({
  milliseconds,
}: {
  milliseconds: number;
}): string => {
  if (milliseconds % 60_000 === 0) {
    return `${milliseconds / 60_000} minute(s)`;
  }

  if (milliseconds % 1000 === 0) {
    return `${milliseconds / 1000} second(s)`;
  }

  return `${milliseconds} millisecond(s)`;
};
