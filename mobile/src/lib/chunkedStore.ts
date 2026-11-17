// Plain logic with no phone code in it, so it can be tested on a computer. See tests/.

/** A place to keep small pieces of text by name. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** How many bytes one character takes when stored (UTF-8). */
function byteLength(character: string): number {
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/** Cuts text into pieces of at most `maxBytes` bytes each, never through the middle of a character. */
export function splitByBytes(value: string, maxBytes: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  let size = 0;
  for (const character of value) {
    const bytes = byteLength(character);
    if (size + bytes > maxBytes && piece !== "") {
      pieces.push(piece);
      piece = "";
      size = 0;
    }
    piece += character;
    size += bytes;
  }
  if (piece !== "" || pieces.length === 0) pieces.push(piece);
  return pieces;
}

const HEAD = /^v1:([a-z0-9]+):(\d+)$/;

function nextRound(previous: string | null): string {
  const number = previous ? parseInt(previous, 36) : 0;
  return ((Number.isFinite(number) ? number : 0) + 1).toString(36);
}

/**
 * Lets a store that only takes small values hold large ones, by keeping a value as numbered
 * pieces. The phone's secure storage is such a store, and a login is too big for one entry.
 *
 * A value is written as a new set of pieces first. Only then is one small "head" entry
 * switched to point at them. A write that is cut short therefore leaves the old value in
 * place, never a mix of old and new.
 */
export function chunked(store: KeyValueStore, maxBytes = 1800): KeyValueStore {
  const readHead = async (key: string): Promise<{ round: string; count: number } | null> => {
    const match = (await store.get(key))?.match(HEAD);
    return match ? { round: match[1], count: Number(match[2]) } : null;
  };

  const removePieces = async (key: string, round: string, count: number) => {
    for (let index = 0; index < count; index++) {
      await store.remove(`${key}.${round}.${index}`);
    }
  };

  return {
    async get(key) {
      const head = await readHead(key);
      if (!head) return null;
      let value = "";
      for (let index = 0; index < head.count; index++) {
        const piece = await store.get(`${key}.${head.round}.${index}`);
        if (piece === null) return null; // A piece is missing: treat the value as gone.
        value += piece;
      }
      return value;
    },

    async set(key, value) {
      const old = await readHead(key);
      const round = nextRound(old?.round ?? null);
      const pieces = splitByBytes(value, maxBytes);
      for (let index = 0; index < pieces.length; index++) {
        await store.set(`${key}.${round}.${index}`, pieces[index]);
      }
      await store.set(key, `v1:${round}:${pieces.length}`);
      if (old) await removePieces(key, old.round, old.count);
    },

    async remove(key) {
      const head = await readHead(key);
      await store.remove(key);
      if (head) await removePieces(key, head.round, head.count);
    },
  };
}
