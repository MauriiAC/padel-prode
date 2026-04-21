import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.mustChangePassword) redirect("/change-password");

  if (session.user.role === "admin") {
    redirect("/admin/tournaments");
  }

  redirect("/player/tournaments");
}
