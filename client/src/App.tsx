import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminPlans from "@/pages/admin-plans";
import PlansPage from "@/pages/plans";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

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
    <Switch>
      <Route path="/" component={user ? () => <ProtectedRoute component={Home} /> : LandingPage} />
      <Route path="/my-songs" component={() => <ProtectedRoute component={MySongsPage} />} />
      <Route path="/my-videos" component={() => <ProtectedRoute component={MyVideosPage} />} />
      <Route path="/characters" component={() => <ProtectedRoute component={CharactersPage} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
      <Route path="/u/:username" component={PublicProfilePage} />
      <Route path="/v/:videoId" component={VideoPage} />
      <Route path="/plans" component={PlansPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/plans" component={AdminPlans} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
