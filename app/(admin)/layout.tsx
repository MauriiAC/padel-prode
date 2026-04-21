import { Header } from "@/components/header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container py-6">{children}</main>
    </div>
  );
}
