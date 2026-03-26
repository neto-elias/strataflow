import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ColorKey = "primary" | "secondary" | "amber" | "emerald" | "blue" | "rose";

const colorMap: Record<ColorKey, { bg: string; icon: string; border: string }> = {
  primary:   { bg: "bg-primary-50 dark:bg-primary-950/40",   icon: "text-primary-600",   border: "border-primary-100 dark:border-primary-900" },
  secondary: { bg: "bg-violet-50 dark:bg-violet-950/40",     icon: "text-violet-600",    border: "border-violet-100 dark:border-violet-900" },
  amber:     { bg: "bg-amber-50 dark:bg-amber-950/40",       icon: "text-amber-600",     border: "border-amber-100 dark:border-amber-900" },
  emerald:   { bg: "bg-emerald-50 dark:bg-emerald-950/40",   icon: "text-emerald-600",   border: "border-emerald-100 dark:border-emerald-900" },
  blue:      { bg: "bg-blue-50 dark:bg-blue-950/40",         icon: "text-blue-600",      border: "border-blue-100 dark:border-blue-900" },
  rose:      { bg: "bg-rose-50 dark:bg-rose-950/40",         icon: "text-rose-600",      border: "border-rose-100 dark:border-rose-900" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href: string;
  color: ColorKey;
  delta?: { value: string; positive: boolean };
}

export function StatCard({ label, value, icon: Icon, href, color, delta }: StatCardProps) {
  const c = colorMap[color];

  return (
    <Link href={href} className="block group" aria-label={`${label}: ${value}`}>
      <Card className={cn("border transition-shadow group-hover:shadow-md", c.border)}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", c.bg)}>
            <Icon className={cn("h-5 w-5", c.icon)} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {delta && (
              <p className={cn("text-xs mt-0.5", delta.positive ? "text-emerald-600" : "text-rose-600")}>
                {delta.positive ? "▲" : "▼"} {delta.value}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
