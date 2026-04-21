import "dotenv/config";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Dev utility to unstick round states during testing.
 *
 * Usage:
 *   pnpm tsx scripts/reopen-rounds.ts             # cerrada → abierta
 *   pnpm tsx scripts/reopen-rounds.ts sin_abrir   # * → sin_abrir (to re-edit playoff)
 */
async function main() {
  const target = (process.argv[2] ?? "abierta") as
    | "sin_abrir"
    | "abierta"
    | "cerrada";

  if (!["sin_abrir", "abierta", "cerrada"].includes(target)) {
    console.error(`Invalid target status: ${target}`);
    process.exit(1);
  }

  let updated;
  if (target === "sin_abrir") {
    // Reset ALL rounds to sin_abrir (useful when you want to re-edit playoff slots)
    updated = await db
      .update(rounds)
      .set({ status: "sin_abrir" })
      .returning({ id: rounds.id, name: rounds.name, status: rounds.status });
  } else if (target === "abierta") {
    updated = await db
      .update(rounds)
      .set({ status: "abierta" })
      .where(eq(rounds.status, "cerrada"))
      .returning({ id: rounds.id, name: rounds.name, status: rounds.status });
  } else {
    updated = await db
      .update(rounds)
      .set({ status: "cerrada" })
      .where(eq(rounds.status, "abierta"))
      .returning({ id: rounds.id, name: rounds.name, status: rounds.status });
  }

  console.log(`Updated to ${target}:`, updated);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
