import { PlayerHeader } from "@/components/player-header";

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PlayerHeader />
      <main className="flex-1 px-4 py-4 max-w-3xl w-full mx-auto">{children}</main>
    </div>
  );
}
