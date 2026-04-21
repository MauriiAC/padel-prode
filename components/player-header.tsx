import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { TournamentSwitcher } from "./tournament-switcher";

export async function PlayerHeader() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  return (
    <header className="border-b bg-card sticky top-0 z-10">
      <div className="container flex h-14 items-center justify-between px-4">
        <Link href="/player/tournaments" className="font-semibold text-primary">
          Padel Prode
        </Link>
        <div className="flex items-center gap-1">
          <TournamentSwitcher basePath="/player/tournaments" />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
