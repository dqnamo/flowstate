const STEP_COUNT = 4;

export default function SetupSteps({ activeStep }: { activeStep: number }) {
  const currentStep = Math.min(Math.max(activeStep, 1), STEP_COUNT);

  return (
    <div className="flex w-fit items-center gap-1">
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
              "h-2 w-3 rounded-full transition-colors",
              isActive
                ? "bg-accent-9"
                : isDone
                  ? "bg-grayscale-12"
                  : "bg-grayscale-4",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
