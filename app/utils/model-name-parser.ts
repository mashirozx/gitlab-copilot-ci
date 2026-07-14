export const parseModelSpec = ({
  model,
}: {
  model?: string;
}): {
  model?: string;
  effort?: string;
  provider?: string;
} => {
  if (!model?.trim()) {
    return {};
  }

  const trimmed = model.trim();
  const separatorIndex = trimmed.lastIndexOf(":");

  if (separatorIndex < 0) {
    const parsedModel = stripProviderPrefix({ model: trimmed });
    const provider = getProviderPrefix({ model: trimmed });

    return {
      ...(parsedModel ? { model: parsedModel } : {}),
      ...(provider ? { provider } : {}),
    };
  }

  const modelWithProvider = trimmed.slice(0, separatorIndex);
  const parsedModel = stripProviderPrefix({ model: modelWithProvider });
  const provider = getProviderPrefix({ model: modelWithProvider });
  const effort = trimmed
    .slice(separatorIndex + 1)
    .trim()
    .toLowerCase();

  return {
    ...(parsedModel ? { model: parsedModel } : {}),
    ...(provider ? { provider } : {}),
    effort,
  };
};

const getProviderPrefix = ({
  model,
}: {
  model: string | undefined;
}): string | undefined => {
  const trimmedModel = model?.trim();

  if (!trimmedModel) {
    return undefined;
  }

  const separatorIndex = trimmedModel.lastIndexOf("/");

  return separatorIndex > 0
    ? trimmedModel.slice(0, separatorIndex).trim() || undefined
    : undefined;
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
