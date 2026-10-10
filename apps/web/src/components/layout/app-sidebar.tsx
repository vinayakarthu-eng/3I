"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Activity,
  Award,
  BarChart3,
  ClipboardList,
  FileBarChart,
  FileCheck2,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/drills", label: "Drills", icon: ClipboardList },
  { href: "/scenarios", label: "Scenarios", icon: LayoutTemplate },
  { href: "/readiness", label: "Readiness", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/actions", label: "Actions", icon: ListChecks },
  { href: "/compliance", label: "Compliance", icon: FileCheck2 },
  { href: "/certifications", label: "Certifications", icon: Award },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

interface ShellProps {
  user: { name: string; email: string; role: string };
  org: { id: string; name: string };
  orgs: { id: string; name: string }[];
  children: ReactNode;
}

export function AppShell({ user, org, orgs, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-muted/30 md:flex print:!hidden">
        <SidebarContent user={user} org={org} orgs={orgs} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 border-r bg-background">
            <SidebarContent user={user} org={org} orgs={orgs} />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </Button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden print:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Logo />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 print:p-0">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ShieldCheck className="h-4 w-4" />
      </span>
      DrillForce
    </Link>
  );
}

function SidebarContent({ user, org, orgs }: Omit<ShellProps, "children">) {
  const pathname = usePathname();

  return (
    <div className="flex w-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      <div className="px-3 pb-2">
        <OrgSwitcher org={org} orgs={orgs} />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <UserMenu user={user} />
      </div>
    </div>
  );
}

function OrgSwitcher({ org, orgs }: Pick<ShellProps, "org" | "orgs">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between px-3">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{org.name}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} className="justify-between">
            {o.name}
            {o.id === org.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Plus className="h-4 w-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: Pick<ShellProps, "user">) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side="top">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs font-normal capitalize text-muted-foreground">
            {user.role.replace("_", " ")}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="mr-2 h-4 w-4" /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
