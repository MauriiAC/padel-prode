import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { TournamentSwitcher } from "@/components/tournament-switcher";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <header className="border-b bg-card">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="font-semibold text-primary">
          Padel Prode
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {isAdmin ? (
            <>
              <Link href="/admin/tournaments" className="px-2 hover:underline">
                Torneos
              </Link>
              <Link href="/admin/users" className="px-2 hover:underline">
                Usuarios
              </Link>
            </>
          ) : (
            <TournamentSwitcher basePath="/player/tournaments" />
          )}
          <span className="text-muted-foreground px-2">{user.name}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
