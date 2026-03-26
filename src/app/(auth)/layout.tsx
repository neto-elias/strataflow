import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex flex-col justify-between bg-primary-950 p-10 text-white">
        <div className="flex items-center gap-2">
          {/* Logo mark */}
          <div className="h-8 w-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-5 w-5 text-white"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight">StrataFlow</span>
        </div>

        <div className="space-y-4">
          <blockquote className="text-2xl font-medium leading-relaxed text-white/90">
            "Effortless strata management — from council meetings to maintenance
            tickets, all in one place."
          </blockquote>
          <p className="text-sm text-white/50">
            Trusted by strata councils and property managers across the country.
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm text-white/40">
          <span>© {new Date().getFullYear()} StrataFlow</span>
          <span>·</span>
          <a href="#" className="hover:text-white/70 transition-colors">
            Privacy Policy
          </a>
          <span>·</span>
          <a href="#" className="hover:text-white/70 transition-colors">
            Terms of Service
          </a>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex flex-col items-center justify-center p-8">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="h-8 w-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-5 w-5 text-white"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight">StrataFlow</span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
