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
  agent,
  model,
  effort,
}: {
  agent?: string;
  model: string;
  effort?: string;
}): string => {
  const isCopilotAgent = agent === "github-copilot-cli";

  if (/^mimo(?:$|[-:.])/i.test(model.trim())) {
    if (effort === "off" || effort === "disabled") {
      return "thinking: disabled";
    } else if (!effort) {
      return isCopilotAgent ? "thinking: enabled" : "thinking: disabled";
    } else {
      return "thinking: enabled";
    }
  }

  if (/^minimax(?:$|[-:.])/i.test(model.trim())) {
    if (effort === "off" || effort === "disabled") {
      return "thinking: disabled";
    } else if (!effort) {
      return isCopilotAgent ? "thinking: adaptive" : "thinking: disabled";
    } else {
      return "thinking: adaptive";
    }
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

  return `${normalizeConfiguredModelName({ model: configuredModelName })}${!opts?.hideEffort ? ` <kbd>${getConfiguredEffortDisplay({ agent: argv.agent, model: configuredModelName, effort: configuredModelSpec.effort })}</kbd>` : ""}`;
};

export const modelDisplayName = getModelDisplayName();
