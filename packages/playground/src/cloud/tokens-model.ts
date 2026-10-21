// What the API tokens dialog knows and does, without a DOM: the list, the token just created (shown
// once), what is going on and what went wrong. The dialog draws it and calls these methods; a test
// drives it with a fake `fetch`.

import {
  checkName,
  explain,
  nameProblem,
  type ApiToken,
  type NewToken,
  type TokenApi,
  type TokenWords,
} from "./tokens.js";

export interface TokensState {
  /** Whether the list has been read: it is empty and unknown until `ready`. */
  readonly list: "loading" | "ready" | "failed";
  readonly tokens: readonly ApiToken[];
  /** A creation or a revocation is on its way: the form and the buttons wait. */
  readonly busy: boolean;
  /**
   * The token just created, in clear. It lives here and in the field that shows it, until the next
   * creation, its revocation or `forget()`: the service never gives it again.
   */
  readonly revealed: NewToken | undefined;
  /** Something that is going on or went well, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
}

export class TokensModel {
  private current: TokensState = {
    list: "loading",
    tokens: [],
    busy: false,
    revealed: undefined,
    status: "",
    problem: "",
  };

  constructor(
    private readonly api: TokenApi,
    private readonly words: () => TokenWords,
    private readonly changed: (state: TokensState) => void,
  ) {}

  get state(): TokensState {
    return this.current;
  }

  private update(patch: Partial<TokensState>): void {
    this.current = { ...this.current, ...patch };
    this.changed(this.current);
  }

  /** Reads the list of tokens. */
  async load(): Promise<void> {
    this.update({ list: "loading", status: this.words().loading, problem: "" });
    const listed = await this.api.list();
    if (listed.ok) {
      this.update({ list: "ready", tokens: listed.value, status: "" });
    } else {
      this.update({ list: "failed", status: "", problem: explain(listed.failure, this.words()) });
    }
  }

  /**
   * Makes a token with the name a person typed. A refused name never reaches the service; while
   * another call is on its way nothing is sent. True when the token was made: it is then
   * `state.revealed`, and the list is read again.
   */
  async create(typed: string): Promise<boolean> {
    if (this.current.busy) return false;
    const words = this.words();
    const checked = checkName(typed);
    if (!checked.ok) {
      this.update({ status: "", problem: nameProblem(checked.reason, words) });
      return false;
    }
    this.update({ busy: true, status: words.creating, problem: "" });
    const made = await this.api.create(checked.name);
    if (!made.ok) {
      this.update({ busy: false, status: "", problem: explain(made.failure, this.words()) });
      return false;
    }
    // The token is in this answer only: show it before anything else can fail.
    this.update({ revealed: made.value, status: this.words().made(made.value.name) });
    const listed = await this.api.list();
    if (listed.ok) this.update({ busy: false, list: "ready", tokens: listed.value });
    else this.update({ busy: false, problem: explain(listed.failure, this.words()) });
    return true;
  }

  /** Revokes a token. True when it is gone: revoked now, or already revoked elsewhere. */
  async revoke(token: ApiToken): Promise<boolean> {
    if (this.current.busy) return false;
    this.update({ busy: true, status: "", problem: "" });
    const revoked = await this.api.revoke(token.id);
    // A 404 means the token is not there (revoked from another tab, say): that is what was asked.
    if (!revoked.ok && revoked.failure.status !== 404) {
      this.update({ busy: false, problem: explain(revoked.failure, this.words()) });
      return false;
    }
    // A token that is revoked cannot be copied any more: its field goes with it.
    const revealed = this.current.revealed?.id === token.id ? undefined : this.current.revealed;
    this.update({
      busy: false,
      tokens: this.current.tokens.filter((held) => held.id !== token.id),
      revealed,
      status: revoked.ok ? this.words().revoked(token.name) : this.words().alreadyGone,
    });
    return true;
  }

  /** Drops the token that was shown: it is not kept anywhere once the dialog closes. */
  forget(): void {
    if (this.current.revealed) this.update({ revealed: undefined });
  }
}
