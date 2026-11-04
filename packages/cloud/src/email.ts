// An email address an owner types: of a project's invitation (`project-sharing`) or of an
// invitation to administer the service (`service-administration`). Both are stored and matched in
// lower case, against the email the identity service verified.

import { fail } from "./errors.js";

/** The longest email address (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;

/** An address with something before the `@` and a dotted name after it, and no space or control character. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /\p{Cc}/u;

/** The email an invitation is for, trimmed and in lower case (the case it is stored and matched in). */
export function readEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw fail("request.invalid", "An invitation needs the email address of the person.");
  }
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email) || CONTROL.test(email)) {
    throw fail("request.invalid", "That is not an email address.");
  }
  return email;
}
