import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateTemporaryPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies with the original password", async () => {
    const hash = await hashPassword("SuperSecret123!");
    expect(hash).not.toBe("SuperSecret123!");
    expect(await verifyPassword("SuperSecret123!", hash)).toBe(true);
  });

  it("rejects incorrect passwords", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});

describe("generateTemporaryPassword", () => {
  it("returns a string of at least 10 characters", () => {
    const pw = generateTemporaryPassword();
    expect(pw.length).toBeGreaterThanOrEqual(10);
  });

  it("returns different values on each call", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).not.toBe(b);
  });

  it("contains only URL-safe characters", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
