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
          <DialogTitle>Subscribe to Download Songs</DialogTitle>
          <DialogDescription className="pt-2">
            Downloading songs requires a paid plan. Try our Basic plan for just $1/month with a 3-day free trial to unlock downloads and 4,000 credits.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          <Link href="/plans?trial=1">
            <Button className="w-full sm:w-auto" onClick={onClose}>
              Start $1 Trial
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
