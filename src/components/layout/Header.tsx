"use client";

import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { Bell, Search, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user: Session["user"];
  sidebarCollapsed: boolean;
}

// Map route segments to human-readable breadcrumbs
const routeLabels: Record<string, string> = {
  dashboard:     "Dashboard",
  buildings:     "Buildings",
  members:       "Members",
  meetings:      "Meetings",
  documents:     "Documents",
  maintenance:   "Maintenance",
  payments:      "Payments",
  inventory:     "Inventory",
  votes:         "Votes",
  notifications: "Notifications",
  settings:      "Settings",
};

export function Header({ user, sidebarCollapsed }: HeaderProps) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "dashboard";
  const pageTitle = routeLabels[segment] ?? segment;

  return (
    <header
      className={cn(
        "flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-6",
      )}
      role="banner"
    >
      {/* Page title */}
      <h2 className="font-semibold text-sm hidden sm:block">{pageTitle}</h2>

      {/* Global search — wired in Phase 4 */}
      <div className="flex-1 max-w-sm ml-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search…"
            className="pl-8 h-8 text-sm bg-background"
            aria-label="Global search"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications bell — wired in Phase 4 */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {/* Placeholder badge — will be dynamic */}
          <Badge
            className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-primary-500 text-white border-0"
            aria-label="3 unread notifications"
          >
            3
          </Badge>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 rounded-full p-0"
              aria-label="Open user menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image ?? ""} alt={user?.name ?? ""} />
                <AvatarFallback className="bg-primary-100 text-primary-700 text-xs">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <a href="/settings/profile">
                <User className="mr-2 h-4 w-4" />
                Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </a>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}
