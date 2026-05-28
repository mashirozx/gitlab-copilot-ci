import { argv } from "./argv";
import { getPromptModelSpec } from "./model-name-parser";

export const modelDisplayName = (() => {
  const DEFAULT_CONFIGURED_MODEL_EFFORT = "medium";
  const configuredModelSpec = getPromptModelSpec({
    model: argv["model"],
  });

  const configuredModelName = configuredModelSpec.model;

  if (!configuredModelName) {
    return "";
  }

  const normalizeConfiguredModelName = ({
    model,
  }: {
    model: string;
  }): string => {
    return model
      .trim()
      .replace(/[\s_:/]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  };

  const getConfiguredEffortDisplay = (): string => {
    if (/^mimo(?:$|[-:.])/i.test(configuredModelName.trim())) {
      return configuredModelSpec.effort
        ? "thinking: enabled"
        : "thinking: disabled";
    }

    return configuredModelSpec.effort ?? DEFAULT_CONFIGURED_MODEL_EFFORT;
  };

  return `${normalizeConfiguredModelName({ model: configuredModelName })} <kbd>${getConfiguredEffortDisplay()}</kbd>`;
})();
