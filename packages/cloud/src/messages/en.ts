import { cliAuthEn } from "./cli-auth.js";
import { commonEn } from "./common.js";
import { consentEn } from "./consent.js";

export const en = { common: commonEn, cliAuth: cliAuthEn, consent: consentEn };

/** The shape of the catalog: the Spanish one must have it exactly. */
export type Messages = typeof en;
