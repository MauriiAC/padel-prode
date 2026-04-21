"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Zonas", segment: "groups" },
  { label: "Playoff", segment: "playoff" },
  { label: "Ranking", segment: "ranking" },
];

export function PlayerBottomNav({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 border-t bg-card">
      <div className="container grid grid-cols-3 max-w-3xl">
        {TABS.map((tab) => {
          const href = `/player/tournaments/${tournamentId}/${tab.segment}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.segment}
              href={href}
              className={cn(
                "py-3 text-center text-sm font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
