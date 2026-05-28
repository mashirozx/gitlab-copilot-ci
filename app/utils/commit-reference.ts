import { env } from "./env";

export const getCurrentCommitSha = (): string | undefined => {
  const commitSha = env.CI_COMMIT_SHA?.trim();

  return commitSha && commitSha.length > 0 ? commitSha : undefined;
};

export const getCurrentCommitShortSha = (): string => {
  const explicitShortSha = env.CI_COMMIT_SHORT_SHA?.trim();

  if (explicitShortSha && explicitShortSha.length > 0) {
    return explicitShortSha;
  }

  return getCurrentCommitSha()?.slice(0, 8) ?? "unknown";
};

export const getCurrentCommitUrl = (): string | undefined => {
  const projectUrl = env.CI_PROJECT_URL?.trim();
  const commitSha = getCurrentCommitSha();

  if (!projectUrl || !commitSha) {
    return undefined;
  }

  return `${projectUrl}/-/commit/${commitSha}`;
};

export const buildCurrentCommitReference = (): string => {
  const commitShortSha = getCurrentCommitShortSha();
  const commitUrl = getCurrentCommitUrl();

  return commitUrl
    ? `[\`${commitShortSha}\`](${commitUrl})`
    : `\`${commitShortSha}\``;
};
