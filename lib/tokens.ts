import { randomBytes } from "crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}
