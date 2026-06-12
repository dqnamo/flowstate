const STEP_COUNT = 4;

export default function SetupSteps({ activeStep }: { activeStep: number }) {
  const currentStep = Math.min(Math.max(activeStep, 1), STEP_COUNT);

  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">
        Setup progress, step {currentStep} of {STEP_COUNT}
      </span>
      {Array.from({ length: STEP_COUNT }).map((_, index) => {
        const stepNumber = index + 1;
        const isDone = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <div
            key={stepNumber}
            aria-hidden="true"
            className={[
              "h-2 flex-1 rounded-full transition-colors",
              isActive
                ? "bg-grayscale-12"
                : isDone
                  ? "bg-accent-9"
                  : "bg-grayscale-4",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
