const SUPPORTED_MODEL_EFFORTS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "none",
  "max",
]);

export const parseModelSpec = ({
  model,
}: {
  model?: string;
}): {
  model?: string;
  effort?: string;
} => {
  if (!model?.trim()) {
    return {};
  }

  const trimmed = model.trim();
  const separatorIndex = trimmed.lastIndexOf(":");

  if (separatorIndex < 0) {
    return { model: trimmed };
  }

  const parsedModel = trimmed.slice(0, separatorIndex).trim();
  const effort = trimmed
    .slice(separatorIndex + 1)
    .trim()
    .toLowerCase();

  if (!parsedModel || !effort || !SUPPORTED_MODEL_EFFORTS.has(effort)) {
    return { model: trimmed };
  }

  return {
    model: parsedModel,
    effort,
  };
};
