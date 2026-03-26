import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import {
  Building2,
  Users,
  Wrench,
  FileText,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder stats — Phase 4 will wire real DB queries
const placeholderStats = [
  {
    label: "Buildings",
    value: "—",
    icon: Building2,
    href: "/buildings",
    color: "primary" as const,
  },
  {
    label: "Members",
    value: "—",
    icon: Users,
    href: "/members",
    color: "secondary" as const,
  },
  {
    label: "Open Requests",
    value: "—",
    icon: Wrench,
    href: "/maintenance",
    color: "amber" as const,
  },
  {
    label: "Documents",
    value: "—",
    icon: FileText,
    href: "/documents",
    color: "emerald" as const,
  },
  {
    label: "Upcoming Meetings",
    value: "—",
    icon: CalendarDays,
    href: "/meetings",
    color: "blue" as const,
  },
  {
    label: "Payments Due",
    value: "—",
    icon: TrendingUp,
    href: "/payments",
    color: "rose" as const,
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8 page-enter">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good {getGreeting()}, {name} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening across your properties today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {placeholderStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Lower row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
