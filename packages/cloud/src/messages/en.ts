import { cliAuthEn } from "./cli-auth.js";
import { commonEn } from "./common.js";

export const en = { common: commonEn, cliAuth: cliAuthEn };

/** The shape of the catalog: the Spanish one must have it exactly. */
export type Messages = typeof en;
