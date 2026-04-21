import { describe, it, expect } from "vitest";
import { generateResetToken, isTokenExpired, RESET_TOKEN_TTL_MS } from "./tokens";

describe("generateResetToken", () => {
  it("returns a URL-safe string of at least 32 chars", () => {
    const token = generateResetToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateResetToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("isTokenExpired", () => {
  it("returns false for a token created now", () => {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + RESET_TOKEN_TTL_MS);
    expect(isTokenExpired(expiresAt)).toBe(false);
  });

  it("returns true for a token with past expiration", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isTokenExpired(expiresAt)).toBe(true);
  });

  it("RESET_TOKEN_TTL_MS equals 1 hour", () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});
