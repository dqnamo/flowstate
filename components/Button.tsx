"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import CornerBrackets from "@/components/CornerBrackets";
import { cn } from "@/helpers/classname-helper";

export type ButtonProps = ComponentProps<typeof BaseButton> & {
  variant?: "primary" | "secondary";
};

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: ButtonProps) {
  const isSecondary = variant === "secondary";

  return (
    <BaseButton
      className={cn(
        "group relative flex min-w-0 flex-row items-center justify-center gap-4 overflow-visible rounded-[8px] border px-2 py-1.5 pr-2 pl-3 transition-transform duration-150 hover:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
        isSecondary
          ? "border-grayscale-3 bg-white text-grayscale-12 hover:border-grayscale-5 hover:bg-grayscale-2 [&_kbd]:bg-grayscale-3 [&_kbd]:text-grayscale-10"
          : "border-transparent bg-black [&_kbd]:bg-grayscale-11 [&_kbd]:text-grayscale-1",
        className,
      )}
      {...props}
    >
      <CornerBrackets
        placement="outside"
        spacing={4}
        translate={6}
        color={isSecondary ? "grayscale-4" : "black"}
        hoverColor={isSecondary ? "grayscale-7" : undefined}
      />
      <span
        className={cn(
          "min-w-0 truncate text-sm transition-colors",
          isSecondary
            ? "text-grayscale-12"
            : "text-grayscale-2 group-hover:text-grayscale-1",
        )}
      >
        {children}
      </span>
    </BaseButton>
  );
}
