import { useState } from "react";
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
import { Loader2, Camera } from "lucide-react";

interface CameraAngleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (params: {
    horizontalAngle: number;
    verticalAngle: number;
    distance: number;
  }) => void;
  isLoading: boolean;
  sceneIndex: number;
}

export function CameraAngleModal({
  isOpen,
  onClose,
  onApply,
  isLoading,
  sceneIndex,
}: CameraAngleModalProps) {
  const [horizontalAngle, setHorizontalAngle] = useState(45);
  const [verticalAngle, setVerticalAngle] = useState(0);
  const [distance, setDistance] = useState(1);

  const handleApply = () => {
    onApply({
      horizontalAngle,
      verticalAngle,
      distance,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Camera Angle - Scene {sceneIndex + 1}
          </DialogTitle>
          <DialogDescription>
            Adjust the camera angle parameters to regenerate the scene image from a different perspective.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="horizontal-angle">Horizontal Angle</Label>
              <span className="text-sm text-muted-foreground">{horizontalAngle}°</span>
            </div>
            <Slider
              id="horizontal-angle"
              value={[horizontalAngle]}
              onValueChange={(value) => setHorizontalAngle(value[0])}
              min={-180}
              max={180}
              step={1}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Rotates the camera horizontally around the subject (-180° to 180°)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="vertical-angle">Vertical Angle</Label>
              <span className="text-sm text-muted-foreground">{verticalAngle}°</span>
            </div>
            <Slider
              id="vertical-angle"
              value={[verticalAngle]}
              onValueChange={(value) => setVerticalAngle(value[0])}
              min={-90}
              max={90}
              step={1}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Tilts the camera up or down (-90° to 90°)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label htmlFor="distance">Distance</Label>
              <span className="text-sm text-muted-foreground">{distance.toFixed(1)}</span>
            </div>
            <Slider
              id="distance"
              value={[distance]}
              onValueChange={(value) => setDistance(value[0])}
              min={0.5}
              max={3}
              step={0.1}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Controls camera distance from the subject (0.5 to 3)
            </p>
          </div>
        </div>

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
              "Apply Camera Angle"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
