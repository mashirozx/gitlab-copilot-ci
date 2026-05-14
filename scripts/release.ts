#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { consola } from "consola";
import { colorize } from "consola/utils";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  name: string;
  version: string;
};

const currentVersion = pkg.version;
consola.info(`Current version: ${colorize("cyanBright", currentVersion)}`);

const gitStatus = execSync("git status --porcelain").toString().trim();
if (gitStatus) {
  consola.error(
    "Uncommitted changes detected. Please commit or stash them before releasing.",
  );
  consola.log(gitStatus);
  process.exit(1);
}

const lastCommitMsg = execSync("git log -1 --format=%s").toString().trim();
if (/^chore: 🔖 release v/.test(lastCommitMsg)) {
  consola.error(
    `Last commit is already a release: "${lastCommitMsg}". Bump the code first.`,
  );
  process.exit(1);
}

const [major = 0, minor = 0, patch = 0] = currentVersion.split(".").map(Number);

// Format version with the changed segment highlighted
const formatVersionDiff = ({
  from,
  to,
  changedIndex,
}: {
  from: number[];
  to: number[];
  changedIndex: number;
}): string => {
  const fmt = (parts: number[], highlight: "bgRedBright" | "bgGreenBright") =>
    parts
      .map((p, i) =>
        i === changedIndex
          ? colorize(highlight, ` ${p} `)
          : colorize("whiteBright", String(p)),
      )
      .join(colorize("whiteBright", "."));
  return `( ${fmt(from, "bgRedBright")} -> ${fmt(to, "bgGreenBright")} )`;
};

const versions = [
  [major, minor, patch + 1],
  [major, minor + 1, 0],
  [major + 1, 0, 0],
];
const labels = ["patch", "minor", "major"] as const;
const from = [major, minor, patch];

let selectedTo: number[] | null = null;

for (const [i, to] of versions.entries()) {
  const label = labels[i as 0 | 1 | 2];
  const confirmed = await consola.prompt(
    `Bump ${colorize("yellowBright", label)} version? ${formatVersionDiff({ from, to: to as number[], changedIndex: 2 - i })}`,
    { type: "confirm", initial: false },
  );
  if (confirmed) {
    selectedTo = to as number[];
    break;
  }
}

if (!selectedTo) {
  consola.error("No version selected. Aborting.");
  process.exit(1);
}

const newVersion = selectedTo.join(".");

const commitMessage = `chore: 🔖 release v${newVersion}`;

consola.log("");
consola.info("Release info:");
consola.log(`  ${colorize("yellowBright", commitMessage)}`);
consola.log("");

const confirmed = await consola.prompt("Confirm?", {
  type: "confirm",
  initial: true,
});

if (!confirmed) {
  consola.error("Aborted.");
  process.exit(1);
}

// Update package.json version
pkg.version = newVersion;
writeFileSync("./package.json", `${JSON.stringify(pkg, null, 2)}\n`);

// Stage and commit
execSync("git add package.json");
execSync(`git commit -m "${commitMessage}"`);

consola.success(`Released v${newVersion}!`);
consola.info('Run "git push origin main" to push the release.');
