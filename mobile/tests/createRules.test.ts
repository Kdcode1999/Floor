import { describe, expect, it } from "vitest";

import { cleanSlug, createSpaceMessage, nameProblem, slugify, slugProblem } from "../src/features/create/rules";

// The same pattern the database checks a link word against.
const DATABASE_SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

describe("slugify", () => {
  it("makes a link word from a space name", () => {
    expect(slugify("Kings FX Academy")).toBe("kings-fx-academy");
    expect(slugify("  Pips & Profits!  ")).toBe("pips-profits");
    expect(slugify("Adé's Room")).toBe("ade-s-room");
  });

  it("never ends on a dash, even when cut short", () => {
    const slug = slugify("The Very Long Name Of A Trading Academy For Everyone");
    expect(slug.length).toBeLessThanOrEqual(32);
    expect(slug).toMatch(DATABASE_SLUG);
  });

  it("gives nothing for a name with no letters or numbers", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("cleanSlug", () => {
  it("tidies typing without fighting the person", () => {
    expect(cleanSlug("Kings FX")).toBe("kings-fx");
    expect(cleanSlug("kings-")).toBe("kings-"); // a dash may sit at the end while they type on
    expect(cleanSlug("--kings")).toBe("kings");
    expect(cleanSlug("a--b")).toBe("a-b");
  });
});

describe("slugProblem", () => {
  it("accepts what the database accepts", () => {
    for (const slug of ["abc", "kings-fx", "a1b", "x".repeat(32)]) {
      expect(slugProblem(slug)).toBeNull();
      expect(slug).toMatch(DATABASE_SLUG);
    }
  });

  it("rejects what the database rejects", () => {
    for (const slug of ["", "ab", "kings-", "-kings", "x".repeat(33)]) {
      expect(slugProblem(slug)).not.toBeNull();
      expect(slug).not.toMatch(DATABASE_SLUG);
    }
  });
});

describe("nameProblem", () => {
  it("wants a name of 1 to 40 letters", () => {
    expect(nameProblem("Kings FX Academy")).toBeNull();
    expect(nameProblem("   ")).not.toBeNull();
    expect(nameProblem("x".repeat(41))).not.toBeNull();
  });
});

describe("createSpaceMessage", () => {
  it("puts a taken or kept word under the link word", () => {
    expect(createSpaceMessage({ message: "slug_taken" })).toMatchObject({ field: "slug" });
    expect(createSpaceMessage({ message: "duplicate key value", code: "23505" })).toMatchObject({ field: "slug" });
    expect(createSpaceMessage({ message: "slug_reserved" }).text).toMatch(/kept for Floor/);
  });

  it("explains the rest in plain words", () => {
    expect(createSpaceMessage({ message: "already_has_space" }).text).toMatch(/already have a space/);
    expect(createSpaceMessage({ message: 'violates check constraint "spaces_name_length"' }).field).toBe("name");
    expect(createSpaceMessage({ message: "TypeError: Network request failed" }).field).toBe("form");
  });
});
