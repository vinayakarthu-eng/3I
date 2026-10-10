import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

export function ComingSoon({
  title = "Coming soon",
  description,
  icon: Icon = Construction,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
