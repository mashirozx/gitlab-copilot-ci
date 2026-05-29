import type { ReviewResponseEntity } from "../types/review.types";
import { tryParseJson } from "./json";

type PiUsageEvent = {
  type?: string;
  usage?: ReviewResponseEntity["usage"];
  message?: PiUsageMessage;
  messages?: PiUsageMessage[];
  assistantMessageEvent?: {
    partial?: PiUsageMessage;
  };
};

type PiUsageMessage = {
  role?: string;
  usage?: ReviewResponseEntity["usage"];
};

const isPiUsageMessageArray = (value: unknown): value is PiUsageMessage[] => {
  return Array.isArray(value);
};

const toOptionalNumber = ({
  value,
}: {
  value: unknown;
}): number | undefined => {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

export const normalizePiUsage = ({
  usage,
}: {
  usage: unknown;
}): ReviewResponseEntity["usage"] | undefined => {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const usageRecord = usage as Record<string, unknown>;
  const costRecord =
    usageRecord.cost && typeof usageRecord.cost === "object"
      ? (usageRecord.cost as Record<string, unknown>)
      : undefined;
  const normalizedUsage: ReviewResponseEntity["usage"] = {
    input: toOptionalNumber({ value: usageRecord.input }),
    output: toOptionalNumber({ value: usageRecord.output }),
    cacheRead: toOptionalNumber({ value: usageRecord.cacheRead }),
    cacheWrite: toOptionalNumber({ value: usageRecord.cacheWrite }),
    totalTokens: toOptionalNumber({ value: usageRecord.totalTokens }),
    cost: costRecord
      ? {
          input: toOptionalNumber({ value: costRecord.input }),
          output: toOptionalNumber({ value: costRecord.output }),
          cacheRead: toOptionalNumber({ value: costRecord.cacheRead }),
          cacheWrite: toOptionalNumber({ value: costRecord.cacheWrite }),
          total: toOptionalNumber({ value: costRecord.total }),
        }
      : undefined,
  };

  const hasAnyUsageValue =
    normalizedUsage.input !== undefined ||
    normalizedUsage.output !== undefined ||
    normalizedUsage.cacheRead !== undefined ||
    normalizedUsage.cacheWrite !== undefined ||
    normalizedUsage.totalTokens !== undefined ||
    normalizedUsage.cost?.input !== undefined ||
    normalizedUsage.cost?.output !== undefined ||
    normalizedUsage.cost?.cacheRead !== undefined ||
    normalizedUsage.cost?.cacheWrite !== undefined ||
    normalizedUsage.cost?.total !== undefined;

  return hasAnyUsageValue ? normalizedUsage : undefined;
};

export const getPiUsage = ({
  event,
}: {
  event: PiUsageEvent | null;
}): ReviewResponseEntity["usage"] | undefined => {
  if (!event) {
    return undefined;
  }

  const messages = isPiUsageMessageArray(event.messages) ? event.messages : [];

  const assistantMessage = [
    ...messages,
    ...(event.message ? [event.message] : []),
  ]
    .reverse()
    .find((message) => message.role === "assistant");

  return [
    event.usage,
    assistantMessage?.usage,
    event.assistantMessageEvent?.partial?.usage,
  ]
    .map((usage) => normalizePiUsage({ usage }))
    .find((usage) => usage !== undefined);
};

export const extractPiUsageFromOutput = ({
  output,
}: {
  output: string;
}): ReviewResponseEntity["usage"] | undefined => {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reverse();

  for (const line of lines) {
    if (!line.includes('"usage":')) {
      continue;
    }

    const event = tryParseJson<PiUsageEvent>({ text: line });

    if (
      !event ||
      !["agent_end", "message_end", "message_update", "message_start"].includes(
        event.type ?? "",
      )
    ) {
      continue;
    }

    const usage = getPiUsage({ event });

    if (usage) {
      return usage;
    }
  }

  return undefined;
};
