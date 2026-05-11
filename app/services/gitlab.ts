import { Gitlab } from "@gitbeaker/rest";
import { argv } from "../utils/argv";

export const gitlab = new Gitlab({
  host: argv["gitlab-url"] as string,
  token: argv["gitlab-token"] as string,
});
