import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CORPUS_ROOT } from "./corpus.js";

/**
 * A second flow of the purchase file's `checkout` diagram: the stories of one drawing that a
 * player of several stories offers in its Story picker (decision 0070).
 */
export const REFUND_STORY = `
story refund for checkout {
  title "Refund"

  scene request {
    reveal client, api over 600ms
    trace request over 800ms
  }

  scene refunded {
    highlight orders over 1s
    hold 1s
  }
}
`;

/** A diagram with an error and a story over it: a story that cannot be drawn. */
export const BROKEN_STORY = `
diagram broken: flow {
  direction sideways
  a["A"]
}

story outage for broken {
  scene only {
    reveal a over 500ms
  }
}
`;

/** The purchase file of the corpus, as written. */
export const PURCHASE_SOURCE = readFileSync(
  join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"),
  "utf8",
);

/** The purchase file with the refund story after it: `flows.meltemi` of the tests. */
export const FLOWS_SOURCE = `${PURCHASE_SOURCE}${REFUND_STORY}`;
