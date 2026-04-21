import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export async function TournamentSwitcher({
  basePath,
}: {
  basePath: "/admin/tournaments" | "/player/tournaments";
}) {
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
    })
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt));

  const visible =
    basePath === "/player/tournaments"
      ? rows.filter((t) => t.status !== "draft")
      : rows;

  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Torneos ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link href={`${basePath}/${t.id}`}>{t.name}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
