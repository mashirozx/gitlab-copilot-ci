import { argv } from "./argv";
import { getPromptModelSpec } from "./model-name-parser";

const DEFAULT_CONFIGURED_MODEL_EFFORT = "medium";

const normalizeConfiguredModelName = ({ model }: { model: string }): string => {
  return model
    .trim()
    .replace(/[\s_:/]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
};

const getConfiguredEffortDisplay = ({
  model,
  effort,
}: {
  model: string;
  effort?: string;
}): string => {
  if (/^mimo(?:$|[-:.])/i.test(model.trim())) {
    return effort ? "thinking: enabled" : "thinking: disabled";
  }

  if (/^minimax(?:$|[-:.])/i.test(model.trim())) {
    if (!effort) {
      return DEFAULT_CONFIGURED_MODEL_EFFORT;
    }

    if (effort === "minimal") {
      return "low";
    }

    if (effort === "xhigh") {
      return "high";
    }

    return effort;
  }

  return effort ?? DEFAULT_CONFIGURED_MODEL_EFFORT;
};

export const getModelDisplayName = (opts?: {
  hideEffort?: boolean;
}): string => {
  const configuredModelSpec = getPromptModelSpec({
    model: argv["model"],
  });

  const configuredModelName = configuredModelSpec.model;

  if (!configuredModelName) {
    return "";
  }

  return `${normalizeConfiguredModelName({ model: configuredModelName })}${!opts?.hideEffort ? ` <kbd>${getConfiguredEffortDisplay({ model: configuredModelName, effort: configuredModelSpec.effort })}</kbd>` : ""}`;
};

export const modelDisplayName = getModelDisplayName();
