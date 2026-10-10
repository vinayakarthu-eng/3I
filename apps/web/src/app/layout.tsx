import { AppShell } from "@/components/layout/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { getCurrentUser, getUserOrganizations } from "@/lib/current-user";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "DrillForce", template: "%s · DrillForce" },
  description: "Enterprise drill orchestration platform",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Shell>{children}</Shell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof getCurrentUser>>;
  let orgs: Awaited<ReturnType<typeof getUserOrganizations>>;
  try {
    [session, orgs] = await Promise.all([getCurrentUser(), getUserOrganizations()]);
  } catch (err) {
    return <SetupRequired error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email, role: session.user.role }}
      org={{ id: session.org.id, name: session.org.name }}
      orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
    >
      {children}
    </AppShell>
  );
}

function SetupRequired({ error }: { error: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-lg space-y-4 rounded-lg border p-6">
        <h1 className="text-lg font-semibold">DrillForce can’t reach its database</h1>
        <p className="text-sm text-muted-foreground">
          Make sure Postgres is running and the database is migrated and seeded:
        </p>
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
          docker compose up -d{"\n"}npm run db:migrate{"\n"}npm run db:seed
        </pre>
        <p className="break-words text-xs text-muted-foreground">Error: {error}</p>
      </div>
    </main>
  );
}
