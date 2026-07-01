const SUPPORTED_MODEL_EFFORTS = new Set([
  "off",
  "disabled",
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

const stripProviderPrefix = ({
  model,
}: {
  model: string | undefined;
}): string | undefined => {
  const trimmedModel = model?.trim();

  if (!trimmedModel) {
    return undefined;
  }

  const separatorIndex = trimmedModel.lastIndexOf("/");

  return separatorIndex >= 0
    ? trimmedModel.slice(separatorIndex + 1).trim() || undefined
    : trimmedModel;
};

export const getPromptModelSpec = ({
  model,
}: {
  model?: string;
}): {
  model?: string;
  effort?: string;
  configuredModel?: string;
} => {
  const parsedModelSpec = parseModelSpec({ model });
  const promptModel = stripProviderPrefix({ model: parsedModelSpec.model });

  if (!promptModel) {
    return {};
  }

  return {
    model: promptModel,
    effort: parsedModelSpec.effort,
    configuredModel: parsedModelSpec.effort
      ? `${promptModel}:${parsedModelSpec.effort}`
      : promptModel,
  };
};
