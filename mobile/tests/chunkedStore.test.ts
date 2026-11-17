import { describe, expect, it } from "vitest";

import { chunked, splitByBytes, type KeyValueStore } from "../src/lib/chunkedStore";

/** A store that refuses values above a size, like the phone's secure storage. */
function smallStore(maxBytes: number) {
  const entries = new Map<string, string>();
  let failNextSet = false;
  const store: KeyValueStore = {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      if (failNextSet) {
        failNextSet = false;
        throw new Error("write failed");
      }
      if (new TextEncoder().encode(value).length > maxBytes) throw new Error("value too large");
      entries.set(key, value);
    },
    remove: async (key) => {
      entries.delete(key);
    },
  };
  return { store, entries, failOnce: () => (failNextSet = true) };
}

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe("splitByBytes", () => {
  it("keeps short text in one piece", () => {
    expect(splitByBytes("hello", 10)).toEqual(["hello"]);
  });

  it("gives one empty piece for empty text", () => {
    expect(splitByBytes("", 10)).toEqual([""]);
  });

  it("cuts long text into pieces that each fit", () => {
    const pieces = splitByBytes("a".repeat(25), 10);
    expect(pieces.map((piece) => piece.length)).toEqual([10, 10, 5]);
    expect(pieces.join("")).toBe("a".repeat(25));
  });

  it("counts bytes, not letters, and never cuts a character in half", () => {
    const text = "Adé Ọláolúwa 🙂".repeat(40);
    const pieces = splitByBytes(text, 50);
    for (const piece of pieces) expect(bytes(piece)).toBeLessThanOrEqual(50);
    expect(pieces.join("")).toBe(text);
  });
});

describe("chunked", () => {
  it("holds a value larger than the store allows", async () => {
    const { store } = smallStore(100);
    const big = chunked(store, 100);
    const login = JSON.stringify({ token: "x".repeat(950), name: "Ọláolúwa" });
    await big.set("login", login);
    expect(await big.get("login")).toBe(login);
  });

  it("answers null for a value that was never kept", async () => {
    const { store } = smallStore(100);
    expect(await chunked(store, 100).get("login")).toBeNull();
  });

  it("replaces a value and leaves no old pieces behind", async () => {
    const { store, entries } = smallStore(100);
    const big = chunked(store, 100);
    await big.set("login", "a".repeat(450)); // five pieces
    await big.set("login", "b".repeat(150)); // two pieces
    expect(await big.get("login")).toBe("b".repeat(150));
    expect(entries.size).toBe(3); // the head and two pieces
  });

  it("removes a value and all its pieces", async () => {
    const { store, entries } = smallStore(100);
    const big = chunked(store, 100);
    await big.set("login", "a".repeat(450));
    await big.remove("login");
    expect(await big.get("login")).toBeNull();
    expect(entries.size).toBe(0);
  });

  it("keeps the old value when a write is cut short", async () => {
    const { store, failOnce } = smallStore(100);
    const big = chunked(store, 100);
    await big.set("login", "a".repeat(250));
    failOnce();
    await expect(big.set("login", "b".repeat(250))).rejects.toThrow("write failed");
    expect(await big.get("login")).toBe("a".repeat(250));
  });

  it("treats a value with a missing piece as gone", async () => {
    const { store, entries } = smallStore(100);
    const big = chunked(store, 100);
    await big.set("login", "a".repeat(250));
    const piece = [...entries.keys()].find((key) => key.endsWith(".1"));
    entries.delete(piece!);
    expect(await big.get("login")).toBeNull();
  });

  it("keeps two values apart", async () => {
    const { store } = smallStore(100);
    const big = chunked(store, 100);
    await big.set("login", "a".repeat(250));
    await big.set("device", "phone-1");
    expect(await big.get("login")).toBe("a".repeat(250));
    expect(await big.get("device")).toBe("phone-1");
  });
});
