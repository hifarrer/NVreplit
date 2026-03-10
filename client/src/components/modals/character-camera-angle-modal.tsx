import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Camera, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CharacterCameraAngleModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onSuccess: (newImageUrl: string) => void;
}

export function CharacterCameraAngleModal({
  isOpen,
  onClose,
  imageUrl,
  onSuccess,
}: CharacterCameraAngleModalProps) {
  const [horizontalAngle, setHorizontalAngle] = useState(45);
  const [verticalAngle, setVerticalAngle] = useState(0);
  const [distance, setDistance] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Reset to defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      setHorizontalAngle(45);
      setVerticalAngle(0);
      setDistance(1);
    }
  }, [isOpen]);

  const handleApply = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/change-camera-angle", {
        imageUrl,
        horizontalAngle,
        verticalAngle,
        distance,
      }, { timeout: 300000 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to change camera angle");
      onSuccess(data.imageUrl);
      onClose();
    } catch (err) {
      console.error("Camera angle error:", err);
      toast({
        title: "Camera angle failed",
        description: err instanceof Error ? err.message : "Failed to change camera angle",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Camera angle
          </DialogTitle>
          <DialogDescription>
            Adjust the camera angle to regenerate the character image from a different perspective.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="horizontal_angle" className="text-muted-foreground">
                  horizontal_angle
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Horizontal angle info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Rotates the camera horizontally around the subject (0° to 359°)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  id="horizontal_angle"
                  value={[horizontalAngle]}
                  onValueChange={(v) => setHorizontalAngle(v[0])}
                  min={0}
                  max={359}
                  step={1}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  max={359}
                  value={horizontalAngle}
                  onChange={(e) => setHorizontalAngle(Number(e.target.value) || 0)}
                  className="w-16 h-9 rounded-md border border-input text-center text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="vertical_angle" className="text-muted-foreground">
                  vertical_angle
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Vertical angle info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Tilts the camera up or down (-30° to 60°)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  id="vertical_angle"
                  value={[verticalAngle]}
                  onValueChange={(v) => setVerticalAngle(v[0])}
                  min={-30}
                  max={60}
                  step={1}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={-30}
                  max={60}
                  value={verticalAngle}
                  onChange={(e) => setVerticalAngle(Number(e.target.value) ?? 0)}
                  className="w-16 h-9 rounded-md border border-input text-center text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="distance" className="text-muted-foreground">
                  distance
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Distance info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Camera distance from the subject (0 to 2)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  id="distance"
                  value={[distance]}
                  onValueChange={(v) => setDistance(v[0])}
                  min={0}
                  max={2}
                  step={0.1}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={distance}
                  onChange={(e) => setDistance(Number(e.target.value) ?? 1)}
                  className="w-16 h-9 rounded-md border border-input text-center text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>
        </TooltipProvider>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              "Apply"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
