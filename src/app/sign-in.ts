export const continuing = 'Continue in the sign-in window that opened.';
export const closed = 'Closed the sign-in window? Cancel, then Log in again.';

export const signInWait = { closedAfter: 20_000 };

export function signInText(waited?: boolean): string {
  return waited ? closed : continuing;
}

export class SignInWaits {
  #since = new Map<string, number>();
  #update: () => void;

  constructor(update: () => void) {
    this.#update = update;
  }

  waited(key: string): boolean {
    const now = Date.now();
    const since = this.#since.get(key);
    if (since === undefined) {
      this.#since.set(key, now);
      setTimeout(this.#update, signInWait.closedAfter);
      return false;
    }
    return now - since >= signInWait.closedAfter;
  }

  done(key: string): void {
    this.#since.delete(key);
  }
}
