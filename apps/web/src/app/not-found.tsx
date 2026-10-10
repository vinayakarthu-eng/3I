import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ShieldCheck className="h-7 w-7" />
      </span>
      <p className="mt-6 text-5xl font-bold tracking-tight">404</p>
      <h1 className="mt-2 text-lg font-semibold">This page couldn&apos;t be found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        The drill, report, or page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/drills">Browse drills</Link>
        </Button>
      </div>
    </div>
  );
}
