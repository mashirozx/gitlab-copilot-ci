const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;

export const STDOUT_PRINT_SAFETY_MARGIN_RATIO = 0.2;

const trimTrailingZeros = ({ value }: { value: string }): string => {
  return value.replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/u, "");
};

export const parseStdoutSize = ({
  value,
  optionName,
}: {
  value: string | undefined;
  optionName: string;
}): number => {
  if (value === undefined) {
    throw new Error(`${optionName} is required`);
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb)$/iu);

  if (!match) {
    throw new Error(
      `${optionName} must use a size suffix like 10mb, 512kb, or 42b`,
    );
  }

  const numericValue = Number.parseFloat(match[1] ?? "NaN");
  const unit = (match[2] ?? "").toLowerCase();

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`${optionName} must be a non-negative finite size`);
  }

  if (unit === "b") {
    return Math.floor(numericValue);
  }

  if (unit === "kb") {
    return Math.floor(numericValue * BYTES_PER_KB);
  }

  return Math.floor(numericValue * BYTES_PER_MB);
};

export const formatStdoutSize = ({ bytes }: { bytes: number }): string => {
  if (bytes >= BYTES_PER_MB) {
    return `${trimTrailingZeros({ value: (bytes / BYTES_PER_MB).toFixed(2) })}MB`;
  }

  if (bytes >= BYTES_PER_KB) {
    return `${trimTrailingZeros({ value: (bytes / BYTES_PER_KB).toFixed(2) })}KB`;
  }

  return `${bytes}B`;
};

export const getStdoutPrintBudgetBytes = ({
  maxStdoutSizeBytes,
}: {
  maxStdoutSizeBytes: number;
}): number => {
  return Math.max(
    Math.floor(maxStdoutSizeBytes * (1 - STDOUT_PRINT_SAFETY_MARGIN_RATIO)),
    0,
  );
};
