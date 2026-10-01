import type { ButtonHTMLAttributes, Ref } from "react";

type Variant =
  "neutral" | "primary" | "break" | "danger" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  neutral:
    "bg-slate-900 text-white shadow-sm hover:bg-black disabled:bg-slate-400",
  primary:
    "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 disabled:bg-emerald-300",
  break: "bg-sky-700 text-white shadow-sm hover:bg-sky-800 disabled:bg-sky-300",
  danger:
    "bg-red-700 text-white shadow-sm hover:bg-red-800 disabled:bg-red-300",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className = "",
  variant = "secondary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl px-4 py-2 font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
