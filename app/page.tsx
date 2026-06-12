import DitheredWaves from "@/components/DitheredWaves";
import LandingActions from "@/components/LandingActions";

function CodexMark() {
  return (
    <span
      aria-hidden="true"
      className="size-3 bg-current [mask-image:url('/codex.svg')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
    />
  );
}

function VercelMark() {
  return (
    <span
      aria-hidden="true"
      className="size-3 bg-current [mask-image:url('/vercel.svg')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
    />
  );
}

export default function Home() {
  return (
    <div className="relative h-dvh overflow-hidden bg-grayscale-1">
      <div className="pointer-events-none fixed inset-0 z-0">
        <DitheredWaves height="100%" />
      </div>
      <main className="relative z-10 mx-auto flex h-dvh max-w-md flex-col items-start justify-center p-4 text-center">
        <div className="mx-auto mb-7 flex size-12 -translate-y-4 items-center justify-center rounded-[12px] bg-white shadow-[0_0_34px_rgba(56,189,248,0.42),0_0_80px_rgba(37,99,235,0.22)]">
          <span
            aria-hidden="true"
            className="size-7 bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 [mask-image:url('/wind.png')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
          />
        </div>
        <h1 className="text-xl font-semibold text-balance text-white">
          Enter flow state while coding with codex in your personal cloud
          software factory.
        </h1>
        <p className="text-sm text-balance text-grayscale-6">
          Flowstate turns Codex into a personal cloud software factory for your
          GitHub repos.
        </p>
        <LandingActions />
      </main>
      <p className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-grayscale-4">
        <span>Built in london by</span>
        <a
          href="https://dqnamo.com"
          target="_blank"
          rel="noreferrer"
          className="text-white"
        >
          dqnamo
        </a>
        <span>and</span>
        <a
          href="https://openai.com/codex/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-white"
        >
          <CodexMark />
          codex
        </a>
        <span>on</span>
        <a
          href="https://vercel.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-white"
        >
          <VercelMark />
          vercel
        </a>
      </p>
    </div>
  );
}
