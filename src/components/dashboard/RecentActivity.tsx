import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

// Placeholder — will be replaced with real DB data in Phase 4
const placeholder = [
  { id: 1, type: "maintenance", text: "New maintenance request: Lobby light out", time: "2 min ago" },
  { id: 2, type: "document",    text: "AGM Minutes 2024 uploaded",                 time: "1 hr ago"  },
  { id: 3, type: "meeting",     text: "Council meeting scheduled for Apr 15",      time: "3 hr ago"  },
  { id: 4, type: "payment",     text: "Strata fee received — Unit 204",            time: "5 hr ago"  },
  { id: 5, type: "member",      text: "New member added: Jane Smith (Unit 301)",   time: "1 day ago" },
];

const typeColor: Record<string, string> = {
  maintenance: "bg-amber-100 text-amber-700",
  document:    "bg-blue-100 text-blue-700",
  meeting:     "bg-violet-100 text-violet-700",
  payment:     "bg-emerald-100 text-emerald-700",
  member:      "bg-primary-100 text-primary-700",
};

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {placeholder.map((item, idx) => (
          <div
            key={item.id}
            className="flex items-start gap-3 py-3 border-b border-border last:border-0"
          >
            <span
              className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0 ${typeColor[item.type]}`}
            >
              {item.type}
            </span>
            <p className="text-sm flex-1">{item.text}</p>
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {item.time}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
