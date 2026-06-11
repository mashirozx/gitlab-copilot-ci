import { tmpdir } from "node:os";
import { join } from "node:path";

export const outputJsonPath = join(tmpdir(), "output.json");

export const CLI_COLOR_ENV_DEFAULTS = {
  FORCE_COLOR: "1",
  COLORTERM: "truecolor",
  TERM: "xterm-256color",
} as const;
