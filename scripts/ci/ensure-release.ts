#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";

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

const getGitLabToken = (): string => {
  const token =
    process.env.GITLAB_REPO_PRIVATE_TOKEN ||
    process.env.GITLAB_TOKEN ||
    process.env.CI_JOB_TOKEN ||
    "";

  if (!token) {
    console.error(
      "Missing GitLab token. Expected one of GITLAB_REPO_PRIVATE_TOKEN, GITLAB_TOKEN, or CI_JOB_TOKEN.",
    );
    process.exit(1);
  }

  return token;
};

const writeReleaseEnvFile = ({
  values,
}: {
  values: Record<string, string>;
}): void => {
  const content = `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;

  writeFileSync("./release.env", content, {
    encoding: "utf-8",
  });
};

const version = getPackageVersion();
const apiUrl = getRequiredEnv({
  name: "CI_API_V4_URL",
});
const projectId = getRequiredEnv({
  name: "CI_PROJECT_ID",
});
const token = getGitLabToken();
const releaseTag = `v${version}`;
const releaseUrl = `${apiUrl}/projects/${projectId}/releases/v${version}`;

try {
  const response = await fetch(releaseUrl, {
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });

  if (response.ok) {
    writeReleaseEnvFile({
      values: {
        RELEASE_EXISTS: "true",
        RELEASE_VERSION: version,
        RELEASE_TAG: releaseTag,
      },
    });
    console.log(`Release ${releaseTag} already exists. Skipping publish flow.`);
    process.exit(0);
  }

  if (response.status === 404) {
    writeReleaseEnvFile({
      values: {
        RELEASE_EXISTS: "false",
        RELEASE_VERSION: version,
        RELEASE_TAG: releaseTag,
      },
    });
    console.log(
      `Release ${releaseTag} does not exist. Build and publish will continue.`,
    );
    process.exit(0);
  }

  console.error(`Unexpected response status: ${response.status}`);
  process.exit(1);
} catch (error) {
  console.error(`Failed to check release: ${(error as Error).message}`);
  process.exit(1);
}
