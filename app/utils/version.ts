import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Declare build-time injected variables
declare var __BUILD_VERSION__: string | undefined;
declare var __BUILD_COMMIT__: string | undefined;
declare var __BUILD_PLATFORM__: string | undefined;
declare var __BUILD_REPO__: string | undefined;

export type VersionInfo = {
  name: string;
  version: string;
  platform: string;
  commitHash: string;
  repo: string;
};

export const getVersionInfo = (): VersionInfo => {
  // If these are defined at compile-time via --define, use them
  // (available in compiled binary)
  // eslint-disable-next-line no-typeof-undefined
  if (typeof __BUILD_VERSION__ !== "undefined") {
    return {
      name: "gitlab-copilot-ci",
      version: __BUILD_VERSION__ as string,
      platform: __BUILD_PLATFORM__ as string,
      commitHash: __BUILD_COMMIT__ as string,
      repo: __BUILD_REPO__ as string,
    };
  }

  // Development mode: fetch real-time from package.json and git
  try {
    const packagePath = join(import.meta.dir, "../../package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      name: string;
      version: string;
      repository: string;
    };
    const commit = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      cwd: import.meta.dir,
    }).trim();

    return {
      name: pkg.name,
      version: pkg.version,
      platform: `${process.platform}-${process.arch}`,
      commitHash: commit,
      repo: pkg.repository,
    };
  } catch {
    return {
      name: "gitlab-copilot-ci",
      version: "unknown",
      platform: "unknown",
      commitHash: "unknown",
      repo: "unknown",
    };
  }
};

export const getFormattedVersion = (): string => {
  const info = getVersionInfo();
  return `📦 ${info.name} ${info.version} (${info.platform}) - ${info.commitHash}

🦊 A GitLab CI tool for automated code review using GitHub Copilot CLI.

Repository: ${info.repo}
License: MIT
Author: Mashiro (mashirozx)
GitHub: https://github.com/mashirozx`;
};
