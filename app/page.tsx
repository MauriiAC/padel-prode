import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.mustChangePassword) redirect("/change-password");

  if (session.user.role === "admin") {
    redirect("/admin/tournaments");
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Padel Prode</h1>
        <p className="text-muted-foreground">
          Aún no hay torneos activos para mostrarte. Esperá a que el admin configure uno.
        </p>
      </div>
    </main>
  );
}
