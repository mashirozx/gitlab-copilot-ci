import { CLI_COLOR_ENV_DEFAULTS } from "../constants";

export const withCliColorEnv = ({
  env,
}: {
  env: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv => {
  return {
    ...env,
    FORCE_COLOR: CLI_COLOR_ENV_DEFAULTS.FORCE_COLOR,
    COLORTERM: env.COLORTERM ?? CLI_COLOR_ENV_DEFAULTS.COLORTERM,
    TERM: env.TERM ?? CLI_COLOR_ENV_DEFAULTS.TERM,
  };
};
