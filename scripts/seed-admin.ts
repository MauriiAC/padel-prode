import "dotenv/config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Usage: pnpm seed:admin <email> <password> [name]");
    process.exit(1);
  }

  const displayName = name ?? email.split("@")[0];
  const lowerEmail = email.toLowerCase();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, lowerEmail))
    .limit(1);

  if (existing.length > 0) {
    console.error(`User ${lowerEmail} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    email: lowerEmail,
    name: displayName,
    role: "admin",
    passwordHash,
    mustChangePassword: false,
  });

  console.log(`✓ Admin ${lowerEmail} created.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
