import { Gitlab } from "@gitbeaker/rest";
import { argv } from "../utils/argv";

export const gitlab = new Gitlab({
  host: argv["gitlab-url"],
  token: argv["gitlab-token"],
});
