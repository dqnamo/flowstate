"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import CornerBrackets from "@/components/CornerBrackets";

const githubHref = "https://github.com/";
const buttonRadiusPx = 8;
const shortcutInsetPx = 6;
const shortcutRadiusPx = Math.max(0, buttonRadiusPx - shortcutInsetPx + 2);

function ShortcutBadge({ children }: { children: string }) {
  return (
    <kbd
      className="ml-2 flex size-5 shrink-0 items-center justify-center bg-black/10 font-mono text-xs leading-none"
      style={{ borderRadius: `${shortcutRadiusPx}px` }}
    >
      {children}
    </kbd>
  );
}

export default function LandingActions() {
  const router = useRouter();

  useHotkeys(
    "n",
    () => {
      router.push("/app");
    },
    { preventDefault: true },
  );

  useHotkeys(
    "g",
    () => {
      window.open(githubHref, "_blank", "noopener,noreferrer");
    },
    { preventDefault: true },
  );

  return (
    <div className="mx-auto mt-4 flex flex-row items-center justify-center gap-3">
      <Link
        href="/app"
        className="group relative flex flex-row items-center bg-white px-3 py-1.5 pr-1.5 text-sm text-black transition-transform duration-150 hover:scale-[0.96] hover:text-grayscale-12"
        style={{ borderRadius: `${buttonRadiusPx}px` }}
      >
        <CornerBrackets
          size={9}
          placement="outside"
          spacing={4}
          translate={6}
          color="border-white"
        />
        <span>Get started</span>
        <ShortcutBadge>N</ShortcutBadge>
      </Link>
      <Link
        href={githubHref}
        target="_blank"
        rel="noreferrer"
        className="group relative flex flex-row items-center bg-grayscale-4 px-3 py-1.5 pr-1.5 text-sm text-grayscale-12 transition-transform duration-150 hover:scale-[0.96] hover:text-black"
        style={{ borderRadius: `${buttonRadiusPx}px` }}
      >
        <CornerBrackets
          size={9}
          placement="outside"
          spacing={4}
          translate={6}
          color="border-grayscale-4"
        />
        <span>View on GitHub</span>
        <ShortcutBadge>G</ShortcutBadge>
      </Link>
    </div>
  );
}
