import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "./password";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(rawCredentials) {
        try {
          const parsed = loginSchema.safeParse(rawCredentials);
          if (!parsed.success) {
            console.warn("[auth] credentials shape invalid", parsed.error.flatten());
            return null;
          }

          const { email, password } = parsed.data;
          const lowered = email.toLowerCase();

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, lowered))
            .limit(1);

          if (!user) {
            console.warn(`[auth] user not found for email=${lowered}`);
            return null;
          }

          const valid = await verifyPassword(password, user.passwordHash);
          if (!valid) {
            console.warn(`[auth] password mismatch for email=${lowered}`);
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
          };
        } catch (err) {
          // Auth.js otherwise swallows this and surfaces a generic
          // CredentialsSignin error. Log it so we can diagnose env / DB issues.
          console.error("[auth] authorize threw", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      if (trigger === "update" && session?.mustChangePassword === false) {
        token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "admin" | "player";
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      return session;
    },
  },
});
