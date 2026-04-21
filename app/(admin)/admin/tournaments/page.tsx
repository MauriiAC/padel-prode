export default function TournamentsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Torneos</h1>
      <p className="text-muted-foreground">
        Próximamente en Fase 2. Por ahora podés gestionar los usuarios en{" "}
        <a href="/admin/users" className="text-primary hover:underline">
          /admin/users
        </a>
        .
      </p>
    </div>
  );
}
