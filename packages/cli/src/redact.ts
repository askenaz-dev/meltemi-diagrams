/**
 * An API token of the cloud service: `mdg_` followed by base64url characters (`cli-cloud`,
 * "Tokens never shown"). `mdg_` alone, and words such as `mdg push`, are not tokens.
 */
const API_TOKEN = /mdg_[A-Za-z0-9_-]+/g;

/** What a token is shown as. */
export const REDACTED_TOKEN = "mdg_…";

/**
 * A message with API tokens (`mdg_…`) and the values of secret-looking environment variables
 * (names with KEY, TOKEN, SECRET, PASSWORD or CREDENTIAL) removed, so that an unexpected error never
 * prints a key or a token (decision 0030).
 */
export function redactSecrets(
  message: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  let result = message.replace(API_TOKEN, REDACTED_TOKEN);
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8 || !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)) continue;
    result = result.split(value).join("[redacted]");
  }
  return result;
}
