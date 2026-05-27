#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Gitlab } from "@gitbeaker/rest";

type ReleaseAssetLink = {
  name: string;
  url: string;
  link_type: "package";
};

type GitLabAuth =
  | {
      kind: "token";
      value: string;
    }
  | {
      kind: "jobToken";
      value: string;
    };

type GitLabCommit = {
  id: string;
  title: string;
  message: string;
};

type GitLabCommitListResponse = {
  commits: GitLabCommit[];
  nextPage: number | null;
};

const releaseCommitMessagePattern = /^chore: 🔖 release v/;

const getPackageVersion = (): string => {
  const packageJson = JSON.parse(
    readFileSync("./package.json", {
      encoding: "utf-8",
    }),
  ) as {
    version: string;
  };

  return packageJson.version;
};

const getRequiredEnv = ({ name }: { name: string }): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }

  return value;
};

const getGitLabAuth = (): GitLabAuth => {
  const privateToken =
    process.env.GITLAB_REPO_PRIVATE_TOKEN?.trim() ||
    process.env.GITLAB_TOKEN?.trim() ||
    "";

  if (privateToken) {
    return {
      kind: "token",
      value: privateToken,
    };
  }

  const jobToken = process.env.CI_JOB_TOKEN?.trim() || "";

  if (jobToken) {
    return {
      kind: "jobToken",
      value: jobToken,
    };
  }

  if (!privateToken && !jobToken) {
    console.error(
      "Missing GitLab token. Expected one of GITLAB_REPO_PRIVATE_TOKEN, GITLAB_TOKEN, or CI_JOB_TOKEN.",
    );
    process.exit(1);
  }

  return {
    kind: "token",
    value: "",
  };
};

const getCurrentCommitSha = (): string => {
  return getRequiredEnv({
    name: "CI_COMMIT_SHA",
  });
};

const getGitLabHost = ({ apiUrl }: { apiUrl: string }): string => {
  return apiUrl.replace(/\/api\/v4\/?$/, "");
};

const getGitLabRequestHeaders = ({
  auth,
  contentType,
}: {
  auth: GitLabAuth;
  contentType?: string;
}): Record<string, string> => {
  const headers: Record<string, string> = {};

  if (auth.kind === "jobToken") {
    headers["JOB-TOKEN"] = auth.value;
  } else {
    headers["PRIVATE-TOKEN"] = auth.value;
  }

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
};

const createGitLabClient = ({
  apiUrl,
  auth,
}: {
  apiUrl: string;
  auth: GitLabAuth;
}) => {
  const host = getGitLabHost({ apiUrl });

  if (auth.kind === "jobToken") {
    return new Gitlab({
      host,
      jobToken: auth.value,
    });
  }

  return new Gitlab({
    host,
    token: auth.value,
  });
};

const getCommitSubject = ({ commit }: { commit: GitLabCommit }): string => {
  return (
    commit.title?.trim() || commit.message?.split(/\r?\n/, 1)[0]?.trim() || ""
  );
};

const fetchCommitBySha = async ({
  client,
  projectId,
  commitSha,
}: {
  client: ReturnType<typeof createGitLabClient>;
  projectId: string;
  commitSha: string;
}): Promise<GitLabCommit> => {
  try {
    return (await client.Commits.show(projectId, commitSha)) as GitLabCommit;
  } catch (error) {
    console.error(
      `Failed to load commit ${commitSha}: ${(error as Error).message}`,
    );
    process.exit(1);
  }
};

const fetchCommitList = async ({
  client,
  projectId,
  currentCommitSha,
  page,
  search,
}: {
  client: ReturnType<typeof createGitLabClient>;
  projectId: string;
  currentCommitSha: string;
  page: number;
  search?: string;
}): Promise<GitLabCommitListResponse> => {
  try {
    const response = await client.Commits.all(projectId, {
      refName: currentCommitSha,
      page,
      perPage: 100,
      ...(search ? { search } : {}),
      showExpanded: true,
    });

    return {
      commits: response.data as GitLabCommit[],
      nextPage: response.paginationInfo.next,
    };
  } catch (error) {
    console.error(`Failed to load commit list: ${(error as Error).message}`);
    process.exit(1);
  }
};

const getCurrentCommitMessage = async ({
  client,
  projectId,
  currentCommitSha,
}: {
  client: ReturnType<typeof createGitLabClient>;
  projectId: string;
  currentCommitSha: string;
}): Promise<string> => {
  const commit = await fetchCommitBySha({
    client,
    projectId,
    commitSha: currentCommitSha,
  });
  const subject = getCommitSubject({ commit });

  if (!subject) {
    console.error(`Commit ${currentCommitSha} does not have a readable title.`);
    process.exit(1);
  }

  return subject;
};

const getLastReleaseCommitSha = async ({
  client,
  projectId,
  currentCommitSha,
  currentCommitMessage,
}: {
  client: ReturnType<typeof createGitLabClient>;
  projectId: string;
  currentCommitSha: string;
  currentCommitMessage: string;
}): Promise<string | null> => {
  const shouldSkipCurrentCommit =
    releaseCommitMessagePattern.test(currentCommitMessage);
  let page = 1;

  while (true) {
    const { commits, nextPage } = await fetchCommitList({
      client,
      projectId,
      currentCommitSha,
      page,
      search: "chore: 🔖 release v",
    });

    for (const commit of commits) {
      const subject = getCommitSubject({ commit });

      if (!releaseCommitMessagePattern.test(subject)) {
        continue;
      }

      if (shouldSkipCurrentCommit && commit.id === currentCommitSha) {
        continue;
      }

      return commit.id;
    }

    if (!nextPage) {
      return null;
    }

    page = Number(nextPage);
  }
};

const getChangelogMessages = async ({
  client,
  projectId,
  currentCommitSha,
  lastReleaseCommitSha,
}: {
  client: ReturnType<typeof createGitLabClient>;
  projectId: string;
  currentCommitSha: string;
  lastReleaseCommitSha: string | null;
}): Promise<string[]> => {
  const changelogMessages: string[] = [];
  let page = 1;

  while (true) {
    const { commits, nextPage } = await fetchCommitList({
      client,
      projectId,
      currentCommitSha,
      page,
    });

    if (commits.length === 0) {
      return changelogMessages;
    }

    for (const commit of commits) {
      if (lastReleaseCommitSha && commit.id === lastReleaseCommitSha) {
        return changelogMessages;
      }

      const subject = getCommitSubject({ commit });

      if (subject.length > 0 && !releaseCommitMessagePattern.test(subject)) {
        changelogMessages.push(subject);
      }
    }

    if (!nextPage) {
      return changelogMessages;
    }

    page = Number(nextPage);
  }
};

const buildReleaseDescription = ({
  changelogMessages,
}: {
  changelogMessages: string[];
}): string => {
  const changelogLines =
    changelogMessages.length > 0
      ? changelogMessages.map((message) => `- ${message}`).join("\n")
      : "- No non-release commits found.";

  return `## Changelog\n${changelogLines}`;
};

const getReleaseBinaryNames = ({ version }: { version: string }): string[] => {
  return readdirSync("./dist", {
    encoding: "utf-8",
  })
    .filter((fileName) => fileName.startsWith(`gitlab-copilot-ci-${version}-`))
    .sort();
};

const uploadReleaseAsset = async ({
  apiUrl,
  projectId,
  auth,
  version,
  fileName,
}: {
  apiUrl: string;
  projectId: string;
  auth: GitLabAuth;
  version: string;
  fileName: string;
}): Promise<ReleaseAssetLink> => {
  const uploadUrl = `${apiUrl}/projects/${projectId}/packages/generic/gitlab-copilot-ci/${version}/${fileName}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: getGitLabRequestHeaders({ auth }),
    body: Bun.file(join("dist", fileName)),
  });

  if (!uploadResponse.ok) {
    console.error(`Failed to upload ${fileName}: ${uploadResponse.status}`);
    process.exit(1);
  }

  return {
    name: fileName,
    url: uploadUrl,
    link_type: "package",
  };
};

const version = getPackageVersion();

if (process.env.RELEASE_EXISTS === "true") {
  console.log(`Release v${version} already exists. Skipping publish job.`);
  process.exit(0);
}

const apiUrl = getRequiredEnv({
  name: "CI_API_V4_URL",
});
const projectId = getRequiredEnv({
  name: "CI_PROJECT_ID",
});
const auth = getGitLabAuth();
const gitlab = createGitLabClient({
  apiUrl,
  auth,
});
const releaseTag = process.env.RELEASE_TAG?.trim() || `v${version}`;
const currentCommitSha = getCurrentCommitSha();
const currentCommitMessage = await getCurrentCommitMessage({
  client: gitlab,
  projectId,
  currentCommitSha,
});
const lastReleaseCommitSha = await getLastReleaseCommitSha({
  client: gitlab,
  projectId,
  currentCommitSha,
  currentCommitMessage,
});
const changelogMessages = await getChangelogMessages({
  client: gitlab,
  projectId,
  currentCommitSha,
  lastReleaseCommitSha,
});
const releaseDescription = buildReleaseDescription({
  changelogMessages,
});
const releaseBinaryNames = getReleaseBinaryNames({
  version,
});

if (releaseBinaryNames.length === 0) {
  console.error(
    `No versioned release binaries were found in dist/ for ${releaseTag}.`,
  );
  process.exit(1);
}

const releaseAssetLinks: ReleaseAssetLink[] = [];

for (const fileName of releaseBinaryNames) {
  console.log(`Uploading ${fileName}...`);
  const assetLink = await uploadReleaseAsset({
    apiUrl,
    projectId,
    auth,
    version,
    fileName,
  });

  releaseAssetLinks.push(assetLink);
}

const createReleaseResponse = await fetch(
  `${apiUrl}/projects/${projectId}/releases`,
  {
    method: "POST",
    headers: getGitLabRequestHeaders({
      auth,
      contentType: "application/json",
    }),
    body: JSON.stringify({
      name: releaseTag,
      tag_name: releaseTag,
      ref: currentCommitSha,
      description: releaseDescription,
      assets: {
        links: releaseAssetLinks,
      },
    }),
  },
);

if (createReleaseResponse.ok) {
  console.log(`Release ${releaseTag} created successfully.`);
  process.exit(0);
}

if (createReleaseResponse.status === 409) {
  console.log(`Release ${releaseTag} already exists. Skipping publish job.`);
  process.exit(0);
}

const errorText = await createReleaseResponse.text();
console.error(
  `Failed to create release ${releaseTag}: ${createReleaseResponse.status}`,
);
console.error(`Response: ${errorText}`);
process.exit(1);
