const steps = ["Project", "GitHub", "Repo", "Codex"];

export default function SetupSteps({ activeStep }: { activeStep: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isDone = stepNumber < activeStep;
        const isActive = stepNumber === activeStep;

        return (
          <div
            key={step}
            className={[
              "border p-2 text-xs",
              isActive
                ? "border-accent-8 bg-accent-2 text-accent-12"
                : isDone
                  ? "border-grayscale-5 bg-white text-grayscale-12"
                  : "border-grayscale-4 bg-white text-grayscale-9",
            ].join(" ")}
          >
            <span className="font-medium">{stepNumber}.</span> {step}
          </div>
        );
      })}
    </div>
  );
}
