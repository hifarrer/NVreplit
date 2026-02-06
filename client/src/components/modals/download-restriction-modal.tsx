import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface DownloadRestrictionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DownloadRestrictionModal({
  isOpen,
  onClose,
}: DownloadRestrictionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download Not Available</DialogTitle>
          <DialogDescription className="pt-2">
            Download songs is not supported on a Free Plan, please consider subscribing to one of our plans.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          <Link href="/plans">
            <Button className="w-full sm:w-auto" onClick={onClose}>
              View Plans
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
