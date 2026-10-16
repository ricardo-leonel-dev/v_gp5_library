import { describe, expect, test } from "bun:test";
import { normalizeEmail } from "./email";

describe("normalizeEmail (R1)", () => {
  test("lowercases mixed case", () => {
    expect(normalizeEmail("Foo@Example.COM")).toBe("foo@example.com");
  });

  test("trims surrounding space, tab and newline", () => {
    expect(normalizeEmail(" Foo@X.COM\t\n")).toBe("foo@x.com");
    expect(normalizeEmail("\t\r\n  a@b.c  \n")).toBe("a@b.c");
  });

  test("leaves an already-normalized value unchanged", () => {
    expect(normalizeEmail("a@b.c")).toBe("a@b.c");
  });

  test("whitespace-only becomes the empty string", () => {
    expect(normalizeEmail("   ")).toBe("");
    expect(normalizeEmail(" \t\n ")).toBe("");
  });
});
