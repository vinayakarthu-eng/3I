"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Print Certificate" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} variant="outline" className="print:hidden">
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
