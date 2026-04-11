/**
 * ui.tsx — hand-rolled primitives. Not shadcn — we want zero extra deps.
 * Styled to match the hoops_dashboard-ui palette (yellow on near-black).
 */

import type { ReactNode, ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ---------- Card ----------

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/70 backdrop-blur-sm p-6",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn("text-sm font-semibold uppercase tracking-wider text-muted-foreground", className)}>{children}</h3>;
}

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]",
    secondary:
      "bg-muted text-foreground hover:bg-muted/70 border border-border",
    ghost:
      "bg-transparent text-foreground hover:bg-muted/50",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------- Badge ----------

type BadgeTone = "default" | "primary" | "success" | "warning" | "danger";

export function Badge({ tone = "default", children }: { tone?: BadgeTone; children: ReactNode }) {
  const tones: Record<BadgeTone, string> = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary border border-primary/30",
    success: "bg-success/15 text-[hsl(var(--success))] border border-[hsl(var(--success)/0.3)]",
    warning: "bg-warning/15 text-[hsl(var(--warning))] border border-[hsl(var(--warning)/0.3)]",
    danger: "bg-destructive/15 text-destructive border border-destructive/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

// ---------- Input / Textarea ----------

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground",
        "focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
        "placeholder:text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm font-mono text-foreground",
        "focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
        "placeholder:text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
}

// ---------- MetricCard ----------

export function MetricCard({ label, value, sublabel, tone = "default" }: { label: string; value: string | number; sublabel?: string; tone?: "default" | "primary" | "success" | "warning" }) {
  const colors: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-[hsl(var(--success))]",
    warning: "text-[hsl(var(--warning))]",
  };
  return (
    <Card className="p-5">
      <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-3xl font-bold font-mono", colors[tone])}>{value}</div>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
    </Card>
  );
}
