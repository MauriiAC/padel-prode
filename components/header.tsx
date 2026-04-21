import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  return (
    <header className="border-b bg-card">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="font-semibold text-primary">
          Padel Prode
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user.role === "admin" && (
            <>
              <Link href="/admin/tournaments" className="hover:underline">
                Torneos
              </Link>
              <Link href="/admin/users" className="hover:underline">
                Usuarios
              </Link>
            </>
          )}
          <span className="text-muted-foreground">{user.name}</span>
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
