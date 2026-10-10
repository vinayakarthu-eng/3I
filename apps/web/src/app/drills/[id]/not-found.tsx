import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function DrillNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-xl font-semibold">Drill not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, or the link is incorrect.
      </p>
      <Button asChild className="mt-6">
        <Link href="/drills">Back to drills</Link>
      </Button>
    </div>
  );
}
