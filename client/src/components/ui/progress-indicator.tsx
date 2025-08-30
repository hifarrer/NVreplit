import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  className?: string;
}

const steps = [
  { number: 1, title: "Create Music", description: "Upload or generate audio" },
  { number: 2, title: "Create Character", description: "Upload or generate character" },
  { number: 3, title: "Generate Scenes", description: "AI creates video scenes" },
  { number: 4, title: "Split Audio", description: "Divide audio into segments" },
  { number: 5, title: "Create Videos", description: "Generate video segments" },
  { number: 6, title: "Merge Video", description: "Combine into final video" }
];

export function ProgressIndicator({ currentStep, totalSteps = 6, className }: ProgressIndicatorProps) {
  return (
    <div className={cn("mb-12", className)}>
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center">
          {steps.slice(0, totalSteps).map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div 
                className={cn(
                  "step-indicator",
                  index >= currentStep && "opacity-30"
                )}
                data-testid={`step-indicator-${step.number}`}
              >
                {index < currentStep ? (
                  <i className="fas fa-check text-sm" />
                ) : (
                  step.number
                )}
              </div>
              {index < steps.slice(0, totalSteps).length - 1 && (
                <div 
                  className={cn(
                    "step-connector",
                    index >= currentStep - 1 && "opacity-30"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2" data-testid="current-step-title">
          Step {currentStep}: {steps[currentStep - 1]?.title}
        </h2>
        <p className="text-muted-foreground" data-testid="current-step-description">
          {steps[currentStep - 1]?.description}
        </p>
      </div>
    </div>
  );
}
