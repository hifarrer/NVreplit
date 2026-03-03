import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Home from "@/pages/home";
import AuthPage from "@/pages/auth";
import LandingPage from "@/pages/landing";
import MyVideosPage from "@/pages/my-videos";
import MySongsPage from "@/pages/my-songs";
import CharactersPage from "@/pages/characters";
import ProfilePage from "@/pages/profile";
import PublicProfilePage from "@/pages/public-profile";
import VideoPage from "@/pages/video-page";
import CommunityPage from "@/pages/community";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminPlans from "@/pages/admin-plans";
import PlansPage from "@/pages/plans";
import PaymentSuccessPage from "@/pages/payment-success";
import ReferralsPage from "@/pages/referrals";
import AffiliatesPage from "@/pages/affiliates";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import ContactPage from "@/pages/contact";
import NeonSinglePrompt from "@/pages/neon-single-prompt";
import CreateSelect from "@/pages/create-select";
import CreateSinglePrompt from "@/pages/create-single-prompt";
import CreateSimpleMode from "@/pages/create-simple-mode";
import CreateInstrumental from "@/pages/create-instrumental";
import CreateLyric from "@/pages/create-lyric";
import CreateVideoShorts from "@/pages/create-video-shorts";
import BlogPage from "@/pages/blog";
import BestAIMusicGenerator2025 from "@/pages/blog-post-best-ai-music-generator";
import Version201Release from "@/pages/blog-post-version-2-0-1";
import Version211Release from "@/pages/blog-post-version-2-1-1";
import Version231Release from "@/pages/blog-post-version-2-3-1";
import Version241Release from "@/pages/blog-post-version-2-4-1";
import Version260Release from "@/pages/blog-post-version-2-6-0";
import Version251Release from "@/pages/blog-post-version-2-5-1";
import Version271Release from "@/pages/blog-post-version-2-7-1";
import ChristmasPostcardBlogPost from "@/pages/blog-post-christmas-postcard";
import NeonVideoVsVidMuseVsAivideo from "@/pages/blog-post-neonvideo-vs-vidmuse-vs-aivideo";
import BestAIToolsIndependentMusicians from "@/pages/blog-post-best-ai-tools-independent-musicians";
import BestAIMusicVideoGenerator2026 from "@/pages/blog-post-best-ai-music-video-generator-2026";
import BestAIMusicGenerator from "@/pages/blog-post-best-ai-music-generator-unlimited";
import GiftPage from "@/pages/gift";
import GiftSuccessPage from "@/pages/gift-success";
import RedeemGiftPage from "@/pages/redeem-gift";
import GreetingCardPage from "@/pages/greeting-card-page";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";
import { WelcomePromoBanner } from "@/components/welcome-promo-banner";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <Component />;
}

function AppRouter() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Switch>
        <Route path="/" component={user ? () => <ProtectedRoute component={CreateSelect} /> : LandingPage} />
        <Route path="/create/story-mode" component={() => <ProtectedRoute component={Home} />} />
        <Route path="/create/single-prompt" component={() => <ProtectedRoute component={CreateSinglePrompt} />} />
        <Route path="/create/simple-mode" component={() => <ProtectedRoute component={CreateSimpleMode} />} />
        <Route path="/create/instrumental" component={() => <ProtectedRoute component={CreateInstrumental} />} />
        <Route path="/create/lyric" component={() => <ProtectedRoute component={CreateLyric} />} />
        <Route path="/create/video-shorts" component={() => <ProtectedRoute component={CreateVideoShorts} />} />
        <Route path="/create" component={() => <ProtectedRoute component={CreateSelect} />} />
        <Route path="/my-songs" component={() => <ProtectedRoute component={MySongsPage} />} />
        <Route path="/my-videos" component={() => <ProtectedRoute component={MyVideosPage} />} />
        <Route path="/characters" component={() => <ProtectedRoute component={CharactersPage} />} />
        <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
        <Route path="/referrals" component={() => <ProtectedRoute component={ReferralsPage} />} />
        <Route path="/affiliates" component={() => <ProtectedRoute component={AffiliatesPage} />} />
        <Route path="/u/:username" component={PublicProfilePage} />
        <Route path="/v/:videoId" component={VideoPage} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/plans" component={PlansPage} />
        <Route path="/payment-success" component={() => <ProtectedRoute component={PaymentSuccessPage} />} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/blog" component={BlogPage} />
        <Route path="/best-ai-music-generator" component={BestAIMusicGenerator} />
        <Route path="/best-ai-music-generator-2025" component={BestAIMusicGenerator2025} />
        <Route path="/version-2-0-1-release" component={Version201Release} />
        <Route path="/version-2-1-1-release" component={Version211Release} />
        <Route path="/version-2-3-1-release" component={Version231Release} />
        <Route path="/version-2-4-1-release" component={Version241Release} />
        <Route path="/version-2-6-0-release" component={Version260Release} />
        <Route path="/version-2-5-1-release" component={Version251Release} />
        <Route path="/version-2-7-1-release" component={Version271Release} />
        <Route path="/christmas-postcard-video" component={ChristmasPostcardBlogPost} />
        <Route path="/neonvideo-vs-vidmuse-vs-aivideo" component={NeonVideoVsVidMuseVsAivideo} />
        <Route path="/best-ai-tools-independent-musicians" component={BestAIToolsIndependentMusicians} />
        <Route path="/best-ai-music-video-generator-2026" component={BestAIMusicVideoGenerator2026} />
        <Route path="/neon-single-prompt" component={() => <ProtectedRoute component={NeonSinglePrompt} />} />
        <Route path="/gift" component={() => <ProtectedRoute component={GiftPage} />} />
        <Route path="/gift-success" component={() => <ProtectedRoute component={GiftSuccessPage} />} />
        <Route path="/redeem-gift" component={RedeemGiftPage} />
        <Route path="/greeting/:token" component={GreetingCardPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/admin" component={AdminLogin} />
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/plans" component={AdminPlans} />
        <Route component={NotFound} />
      </Switch>
      {user && (
        <WelcomePromoBanner
          userCreatedAt={user.createdAt}
          userId={user.id}
        />
      )}
    </>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AppRouter />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
