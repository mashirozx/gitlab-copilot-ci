#!/usr/bin/env bun

import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync("./package.json", { encoding: "utf-8" }),
);
const version = packageJson.version as string;

const apiUrl = process.env.CI_API_V4_URL || "";
const projectId = process.env.CI_PROJECT_ID || "";
const releaseUrl = `${apiUrl}/projects/${projectId}/releases/v${version}`;
const releaseCollectionUrl = `${apiUrl}/projects/${projectId}/releases`;

const token =
  process.env.GITLAB_REPO_PRIVATE_TOKEN ||
  process.env.GITLAB_TOKEN ||
  process.env.CI_JOB_TOKEN ||
  "";

try {
  const response = await fetch(releaseUrl, {
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });

  if (response.ok) {
    console.log(`Release v${version} already exists. Continuing.`);
    process.exit(0);
  } else if (response.status === 404) {
    console.log(`Release v${version} does not exist. Creating it now.`);

    const releaseData = {
      name: `v${version}`,
      description: `Release v${version} - Cross-platform binaries`,
      tag_name: `v${version}`,
      ref: process.env.CI_COMMIT_SHA || "",
    };

    const createResponse = await fetch(releaseCollectionUrl, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(releaseData),
    });

    if (createResponse.ok) {
      console.log(`Release v${version} created successfully.`);
      process.exit(0);
    }

    if (createResponse.status === 409) {
      console.log(`Release v${version} already exists. Continuing.`);
      process.exit(0);
    }

    const errorText = await createResponse.text();
    console.error(`Failed to create release: ${createResponse.status}`);
    console.error(`Response: ${errorText}`);
    process.exit(1);
  } else {
    console.error(`Unexpected response status: ${response.status}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`Failed to check release: ${(error as Error).message}`);
  process.exit(1);
}
