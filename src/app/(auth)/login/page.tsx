import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your StrataFlow account.",
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your email or Google account
        </p>
      </div>
      <LoginForm />
      <p className="text-center text-xs text-muted-foreground">
        By signing in you agree to our{" "}
        <a href="#" className="underline underline-offset-4 hover:text-primary-500">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline underline-offset-4 hover:text-primary-500">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
