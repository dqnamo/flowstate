"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cn } from "@/helpers/classname-helper";

const CORNERS = [
  {
    key: "tl",
    anchor: "top-0 left-0",
    border: "border-t-2 border-l-2",
    inside: "translate-x-[3px] translate-y-[3px]",
    outside:
      "group-focus-within:translate-x-[-4px] group-focus-within:translate-y-[-4px]",
  },
  {
    key: "tr",
    anchor: "top-0 right-0",
    border: "border-t-2 border-r-2",
    inside: "translate-x-[-3px] translate-y-[3px]",
    outside:
      "group-focus-within:translate-x-[4px] group-focus-within:translate-y-[-4px]",
  },
  {
    key: "bl",
    anchor: "bottom-0 left-0",
    border: "border-b-2 border-l-2",
    inside: "translate-x-[3px] translate-y-[-3px]",
    outside:
      "group-focus-within:translate-x-[-4px] group-focus-within:translate-y-[4px]",
  },
  {
    key: "br",
    anchor: "bottom-0 right-0",
    border: "border-b-2 border-r-2",
    inside: "translate-x-[-3px] translate-y-[-3px]",
    outside:
      "group-focus-within:translate-x-[4px] group-focus-within:translate-y-[4px]",
  },
];

export function InputBrackets() {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible">
      {CORNERS.map((corner) => (
        <span
          key={corner.key}
          className={cn(
            "absolute h-1.5 w-1.5 border-grayscale-8 opacity-0",
            "[transition:height_200ms_ease-out,translate_200ms_ease-out_200ms,opacity_150ms_ease-out,border-color_200ms_ease-out]",
            "group-focus-within:[transition:translate_200ms_ease-out,height_200ms_ease-out_200ms,opacity_150ms_ease-out,border-color_200ms_ease-out]",
            "group-hover:opacity-100 group-focus-within:h-[calc(50%+4px)] group-focus-within:border-accent-9 group-focus-within:opacity-100",
            corner.anchor,
            corner.border,
            corner.inside,
            corner.outside,
          )}
        />
      ))}
    </span>
  );
}

export type InputProps = ComponentProps<typeof BaseInput> & {
  containerClassName?: string;
};

export function Input({ className, containerClassName, ...props }: InputProps) {
  return (
    <div className={cn("group relative flex w-full", containerClassName)}>
      <BaseInput
        className={cn(
          "w-full rounded-[8px] bg-grayscale-2 px-2 py-1.5 text-xs text-grayscale-12 outline-none transition-colors duration-150 placeholder:text-grayscale-10 focus:bg-grayscale-3",
          className,
        )}
        {...props}
      />
      <InputBrackets />
    </div>
  );
}
