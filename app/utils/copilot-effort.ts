const COPILOT_EFFORT_LEVELS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const normalizeCopilotEffort = ({
  effort,
}: {
  effort: string;
}): string => {
  if (COPILOT_EFFORT_LEVELS.has(effort)) {
    return effort;
  }

  return effort === "off" || effort === "disabled" ? "none" : "medium";
};
