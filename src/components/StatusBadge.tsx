import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: boolean | undefined;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <div className={cn(
      "flex items-center justify-center w-6 h-6 rounded-full border transition-all duration-500",
      status === true
        ? "bg-emerald-50 border-emerald-100"
        : status === false
          ? "bg-rose-50 border-rose-100"
          : "bg-slate-50 border-slate-100",
      className
    )}>
      <span className={cn(
        "w-2 h-2 rounded-full",
        status === true ? "bg-emerald-500 animate-pulse motion-reduce:animate-none" : status === false ? "bg-rose-500" : "bg-slate-400"
      )} />
    </div>
  );
}
