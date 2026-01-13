import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StepCirclesProps {
  currentStep: number;
  totalSteps?: number;
  className?: string;
}

export function StepCircles({ currentStep, totalSteps = 3, className }: StepCirclesProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        
        return (
          <div key={stepNumber} className="flex items-center">
            <div 
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                isCompleted && "bg-primary text-primary-foreground",
                isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background",
                !isCompleted && !isCurrent && "bg-muted text-muted-foreground opacity-50"
              )}
            >
              {isCompleted ? (
                <Check className="w-4 h-4" />
              ) : (
                <span>{stepNumber}</span>
              )}
            </div>
            {index < totalSteps - 1 && (
              <div 
                className={cn(
                  "w-6 h-0.5 mx-1",
                  stepNumber < currentStep ? "bg-primary" : "bg-muted opacity-50"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
