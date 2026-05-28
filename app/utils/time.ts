import { Temporal } from "temporal-polyfill";

export const getNowEpochMilliseconds = (): number => {
  return Temporal.Now.instant().epochMilliseconds;
};

export const getElapsedMilliseconds = ({
  startTimeMs,
}: {
  startTimeMs: number;
}): number => {
  return getNowEpochMilliseconds() - startTimeMs;
};

export const sleepMilliseconds = async ({
  milliseconds,
}: {
  milliseconds: number;
}): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

export const formatLocalTimestamp = ({
  includeMilliseconds = false,
  dateTimeSeparator,
  timeSeparator,
}: {
  includeMilliseconds?: boolean;
  dateTimeSeparator: string;
  timeSeparator: string;
}): string => {
  const dt = Temporal.Now.plainDateTimeISO();
  const y = dt.year;
  const mo = String(dt.month).padStart(2, "0");
  const d = String(dt.day).padStart(2, "0");
  const h = String(dt.hour).padStart(2, "0");
  const mi = String(dt.minute).padStart(2, "0");
  const s = String(dt.second).padStart(2, "0");

  const base = `${y}-${mo}-${d}${dateTimeSeparator}${h}${timeSeparator}${mi}${timeSeparator}${s}`;

  if (!includeMilliseconds) {
    return base;
  }

  const ms = String(dt.millisecond).padStart(3, "0");
  return `${base}.${ms}`;
};
