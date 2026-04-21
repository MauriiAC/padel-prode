"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Equipos", segment: "teams" },
  { label: "Zonas", segment: "groups" },
  { label: "Playoff", segment: "playoff" },
  { label: "Partidos", segment: "matches" },
  { label: "Rondas", segment: "rounds" },
];

export function TabsNav({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b overflow-x-auto">
      {TABS.map((tab) => {
        const href = `/admin/tournaments/${tournamentId}/${tab.segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
