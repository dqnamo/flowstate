"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import CornerBrackets from "@/components/CornerBrackets";
import { cn } from "@/helpers/classname-helper";

export type ButtonProps = ComponentProps<typeof BaseButton>;

export function Button({ className, children, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(
        "group relative flex min-w-0 flex-row items-center justify-center gap-4 overflow-visible rounded-[8px] bg-black px-2 py-1.5 pr-2 pl-3 transition-transform duration-150 hover:scale-[0.96]",
        className,
      )}
      {...props}
    >
      <CornerBrackets
        placement="outside"
        spacing={4}
        translate={6}
        color="black"
      />
      <span className="min-w-0 truncate text-sm text-grayscale-2 transition-colors group-hover:text-grayscale-1">
        {children}
      </span>
    </BaseButton>
  );
}
