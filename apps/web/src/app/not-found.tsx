import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Button asChild className="mt-6">
        <Link href="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}
