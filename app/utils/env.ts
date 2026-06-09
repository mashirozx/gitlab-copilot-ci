export const env = {
  get AGENT_BIN(): string | undefined {
    return process.env.AGENT_BIN;
  },
  get CI_JOB_ID(): string | undefined {
    return process.env.CI_JOB_ID;
  },
  get CI_JOB_URL(): string | undefined {
    return process.env.CI_JOB_URL;
  },
  get CI_COMMIT_SHA(): string | undefined {
    return process.env.CI_COMMIT_SHA;
  },
  get CI_COMMIT_SHORT_SHA(): string | undefined {
    return process.env.CI_COMMIT_SHORT_SHA;
  },
  get CI_MERGE_REQUEST_IID(): string | undefined {
    return process.env.CI_MERGE_REQUEST_IID;
  },
  get CI_PROJECT_ID(): string | undefined {
    return process.env.CI_PROJECT_ID;
  },
  get CI_PROJECT_URL(): string | undefined {
    return process.env.CI_PROJECT_URL;
  },
  get CI_SERVER_URL(): string | undefined {
    return process.env.CI_SERVER_URL;
  },
  get COPILOT_BIN(): string | undefined {
    return process.env.COPILOT_BIN;
  },
  get COPILOT_GITHUB_TOKEN(): string | undefined {
    return process.env.COPILOT_GITHUB_TOKEN;
  },
  get GITHUB_TOKEN(): string | undefined {
    return process.env.GITHUB_TOKEN;
  },
  get GH_TOKEN(): string | undefined {
    return process.env.GH_TOKEN;
  },
  get GITLAB_TOKEN(): string | undefined {
    return process.env.GITLAB_TOKEN;
  },
  get PI_BIN(): string | undefined {
    return process.env.PI_BIN;
  },
  get PI_SKIP_VERSION_CHECK(): string | undefined {
    return process.env.PI_SKIP_VERSION_CHECK;
  },
  get PI_TELEMETRY(): string | undefined {
    return process.env.PI_TELEMETRY;
  },
};
