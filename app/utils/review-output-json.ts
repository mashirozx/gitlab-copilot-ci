import { readFileSync } from "node:fs";
import { outputJsonPath } from "../constants";

export const readReviewOutputJsonFile = (): {
  jsonText: string | null;
  error: string | null;
} => {
  try {
    const jsonText = readFileSync(outputJsonPath, "utf-8");

    if (!jsonText.trim()) {
      return {
        jsonText: null,
        error: `output JSON file is empty: ${outputJsonPath}`,
      };
    }

    return {
      jsonText,
      error: null,
    };
  } catch (error) {
    return {
      jsonText: null,
      error: `failed to read output JSON file at ${outputJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
