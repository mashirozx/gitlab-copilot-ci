#!/usr/bin/env bun

import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const packageJson = JSON.parse(
  readFileSync("./package.json", { encoding: "utf-8" }),
);
const version = packageJson.version as string;

const apiUrl = process.env.CI_API_V4_URL || "";
const projectId = process.env.CI_PROJECT_ID || "";
const jobToken =
  process.env.GITLAB_REPO_PRIVATE_TOKEN ||
  process.env.GITLAB_TOKEN ||
  process.env.CI_JOB_TOKEN ||
  "";
const platform = process.env.PLATFORM || "";
const buildScript = process.env.BUILD_SCRIPT || "";

if (!platform || !buildScript) {
  console.error("Missing PLATFORM or BUILD_SCRIPT environment variable");
  process.exit(1);
}

const isWindowsPlatform = platform.startsWith("win-");

const releaseBinaryName = isWindowsPlatform
  ? `gitlab-copilot-ci-${version}-${platform}.exe`
  : `gitlab-copilot-ci-${version}-${platform}`;
const buildBinaryName = isWindowsPlatform
  ? `gitlab-copilot-ci-${platform}.exe`
  : `gitlab-copilot-ci-${platform}`;

const releaseUrl = `${apiUrl}/projects/${projectId}/releases/v${version}`;

type ReleaseLink = {
  name?: string;
  url?: string;
};

type ReleaseInfo = {
  assets?: {
    links?: ReleaseLink[];
  };
};

const releaseResponse = await fetch(releaseUrl, {
  headers: {
    "PRIVATE-TOKEN": jobToken,
  },
});

if (!releaseResponse.ok) {
  console.error(
    `Release v${version} does not exist or could not be loaded: ${releaseResponse.status}`,
  );
  process.exit(1);
}

const release = (await releaseResponse.json()) as ReleaseInfo;
const existingLink = (release.assets?.links ?? []).find(
  (link) =>
    link.name === releaseBinaryName || link.url?.includes(releaseBinaryName),
);

if (existingLink) {
  console.log(
    `Release asset ${releaseBinaryName} already exists. Skipping build for ${platform}.`,
  );
  process.exit(0);
}

console.log(`Building ${platform}...`);
const buildResult = Bun.spawnSync({
  cmd: ["bun", "run", buildScript],
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

if (buildResult.exitCode !== 0) {
  console.error(
    `Build failed for ${platform} with exit code ${buildResult.exitCode}`,
  );
  process.exit(buildResult.exitCode ?? 1);
}

const sourcePath = join("dist", buildBinaryName);
const releasePath = join("dist", releaseBinaryName);

if (!existsSync(sourcePath)) {
  console.error(`Expected build output not found: ${sourcePath}`);
  process.exit(1);
}

if (existsSync(releasePath)) {
  rmSync(releasePath, { force: true });
}

renameSync(sourcePath, releasePath);

console.log(`Uploading ${releaseBinaryName}...`);

const uploadUrl = `${apiUrl}/projects/${projectId}/packages/generic/gitlab-copilot-ci/${version}/${releaseBinaryName}`;
const uploadResponse = await fetch(uploadUrl, {
  method: "PUT",
  headers: {
    "PRIVATE-TOKEN": jobToken,
  },
  body: Bun.file(releasePath),
});

if (!uploadResponse.ok) {
  console.error(
    `Failed to upload ${releaseBinaryName}: ${uploadResponse.status}`,
  );
  process.exit(1);
}

const linkResponse = await fetch(
  `${apiUrl}/projects/${projectId}/releases/v${version}/assets/links`,
  {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": jobToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: releaseBinaryName,
      url: uploadUrl,
      link_type: "package",
    }),
  },
);

if (!linkResponse.ok) {
  console.error(
    `Failed to add release link for ${releaseBinaryName}: ${linkResponse.status}`,
  );
  process.exit(1);
}

console.log(`Uploaded ${releaseBinaryName} successfully.`);
