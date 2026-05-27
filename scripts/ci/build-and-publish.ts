#!/usr/bin/env bun

import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

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

const version = getPackageVersion();

if (process.env.RELEASE_EXISTS === "true") {
  console.log(`Release v${version} already exists. Skipping build job.`);
  process.exit(0);
}

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

console.log(`Prepared ${releaseBinaryName} for release publishing.`);
