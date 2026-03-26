import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Root route: redirect authenticated users to dashboard, others to login
export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
