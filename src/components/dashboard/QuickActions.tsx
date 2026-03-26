import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Upload, CalendarPlus, UserPlus } from "lucide-react";

const actions = [
  { label: "New Maintenance Request", icon: Plus,         href: "/maintenance/new"    },
  { label: "Upload Document",         icon: Upload,       href: "/documents/upload"   },
  { label: "Schedule Meeting",        icon: CalendarPlus, href: "/meetings/new"       },
  { label: "Invite Member",           icon: UserPlus,     href: "/members/invite"     },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => (
          <Button
            key={action.href}
            variant="outline"
            className="w-full justify-start gap-2 h-9 text-sm"
            asChild
          >
            <Link href={action.href}>
              <action.icon className="h-4 w-4 text-primary-500" aria-hidden="true" />
              {action.label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
