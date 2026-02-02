import { useState, useEffect } from "react";
import { X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const BANNER_DISMISSED_KEY = "neon_welcome_banner_dismissed";
const NEW_USER_DAYS_THRESHOLD = 7; // Show banner for users created within last 7 days

interface WelcomePromoBannerProps {
  userCreatedAt?: string | Date;
  userId?: string;
}

export function WelcomePromoBanner({ userCreatedAt, userId }: WelcomePromoBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();

  useEffect(() => {
    // Check if banner should be shown
    if (!userCreatedAt || !userId) {
      return;
    }

    // Check if user has already dismissed the banner
    const dismissedUserId = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissedUserId === userId) {
      setIsDismissed(true);
      return;
    }

    // Check if user is new (created within last 7 days)
    const createdAt = new Date(userCreatedAt);
    const now = new Date();
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCreation <= NEW_USER_DAYS_THRESHOLD) {
      setIsVisible(true);
    }
  }, [userCreatedAt, userId]);

  const handleDismiss = () => {
    if (userId) {
      localStorage.setItem(BANNER_DISMISSED_KEY, userId);
      setIsDismissed(true);
      setIsVisible(false);
    }
  };

  const handleGetStarted = () => {
    navigate("/plans");
    handleDismiss();
  };

  if (!isVisible || isDismissed) {
    return null;
  }

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-[59] animate-in fade-in duration-300"
          onClick={handleDismiss}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "fixed z-[60] animate-in duration-300",
          isMobile
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm slide-in-from-top-2"
            : "bottom-4 right-4 w-80 slide-in-from-bottom-2"
        )}
      >
        <div className="relative rounded-lg p-[2px] bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 animate-pulse">
          <div className="bg-gradient-to-br from-purple-900 via-pink-900 to-cyan-900 rounded-lg p-4 relative overflow-hidden">
            {/* Animated neon glow effects */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-pink-500/30 rounded-full -mr-20 -mt-20 blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/30 rounded-full -ml-16 -mb-16 blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />
            <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-purple-500/30 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />

            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-75 blur-sm animate-pulse" style={{ zIndex: -1 }} />

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-white/20 transition-all z-10 text-white hover:text-pink-300"
              aria-label="Close banner"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-5 w-5 text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" />
                <h3 className="font-bold text-lg text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">Welcome to NeonVideo!</h3>
              </div>
              <div className="bg-gradient-to-r from-pink-500/40 via-purple-500/40 to-cyan-500/40 backdrop-blur-sm rounded-full px-3 py-1.5 mb-3 inline-block border border-pink-400/50 shadow-[0_0_10px_rgba(244,114,182,0.5)]">
                <span className="text-xs font-bold uppercase tracking-wider text-pink-200 drop-shadow-[0_0_4px_rgba(244,114,182,0.8)] animate-pulse">THIS WEEK ONLY</span>
              </div>
              <p className="text-sm mb-3 text-white/90">
                Get <span className="font-bold text-xl text-pink-300 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)] animate-pulse">50% OFF</span> on any plan with code:
              </p>
              <div className="bg-black/40 backdrop-blur-sm rounded-md px-3 py-2.5 mb-3 border-2 border-cyan-400/60 shadow-[0_0_15px_rgba(34,211,238,0.6)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-[shimmer_2s_infinite]" />
                <code className="text-lg font-mono font-bold tracking-wider text-cyan-300 relative z-10 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]">NEONWELCOME</code>
              </div>
              <Button
                onClick={handleGetStarted}
                className="w-full bg-gradient-to-r from-pink-500 to-cyan-500 hover:from-pink-400 hover:to-cyan-400 text-white font-bold shadow-[0_0_20px_rgba(244,114,182,0.6)] hover:shadow-[0_0_25px_rgba(244,114,182,0.8)] transition-all duration-300 transform hover:scale-105"
                size="sm"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
