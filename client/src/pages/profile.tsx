import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, ArrowLeft, Save, Key, Home as HomeIcon, Music, Video, LogOut, ExternalLink, CreditCard, AlertTriangle, CheckCircle, XCircle, Trash2, Coins } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/neonlogo_1756693857051.png";

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState(user?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Get avatar options from API (handles production URLs)
  const { data: avatarData, isLoading: avatarsLoading, error: avatarsError } = useQuery<{ avatarOptions: Array<{ id: number; url: string; localUrl: string }> }>({
    queryKey: ["/api/avatar-options"],
    staleTime: 2 * 60 * 1000, // 2 minutes - shorter to refresh signed URLs more often
    retry: 2, // Retry failed requests
    retryDelay: 500, // Shorter delay
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on every mount
  });

  // Get subscription status for paid users
  const { data: subscriptionData } = useQuery<{
    hasSubscription: boolean;
    status?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  }>({
    queryKey: ["/api/stripe/subscription-status"],
    enabled: !!(user?.plan && user?.plan?.name !== "Free"),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  const avatarOptions = avatarData?.avatarOptions || [
    // Default anonymous avatar
    {
      id: 0,
      url: `/public-objects/public/avatars/anonymous.png`,
      localUrl: `/public-objects/public/avatars/anonymous.png`
    },
    // Numbered avatars 1-20
    ...Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      url: `/public-objects/public/avatars/avatar${i + 1}.png`,
      localUrl: `/public-objects/public/avatars/avatar${i + 1}.png`
    }))
  ];

  // Helper function to get display URL for user's current avatar
  const getDisplayAvatarUrl = (storedUrl: string | null | undefined): string | null => {
    if (!storedUrl) return null;
    
    // Find matching avatar option to get production-safe URL
    const matchingAvatar = avatarOptions.find(avatar => avatar.localUrl === storedUrl);
    return matchingAvatar?.url || storedUrl;
  };

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string) => {
      const response = await apiRequest("PATCH", "/api/user/avatar", {
        avatarUrl
      });
      return response.json();
    },
    onSuccess: (updatedUser) => {
      // Refresh user data in the auth context
      refreshUser();
      toast({
        title: "Success",
        description: "Avatar updated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update avatar",
        variant: "destructive",
      });
    },
  });

  const handleAvatarSelect = (avatarUrl: string) => {
    updateAvatarMutation.mutate(avatarUrl);
  };

  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      const response = await apiRequest("PATCH", "/api/user/username", {
        username: newUsername
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Success",
        description: "Username updated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update username",
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (passwordData: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("PATCH", "/api/user/password", passwordData);
      return response.json();
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Success",
        description: "Password updated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive",
      });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/cancel-subscription", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/subscription-status"] });
      setShowCancelConfirm(false);
      toast({
        title: "Subscription Cancelled",
        description: data.message || "Your subscription will be cancelled at the end of the current billing period.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  // Buy credits mutation
  const buyCreditsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-credit-checkout-session", {});
      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate credit purchase",
        variant: "destructive",
      });
    },
  });

  // Handle credit purchase success/cancel from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const creditPurchaseStatus = params.get('credit_purchase');
    
    if (creditPurchaseStatus === 'success') {
      toast({
        title: "Credits Added!",
        description: "5,000 credits have been added to your account.",
      });
      // Refresh user data to show updated credits
      refreshUser();
      // Clean up URL
      window.history.replaceState({}, '', '/profile');
    } else if (creditPurchaseStatus === 'cancelled') {
      toast({
        title: "Purchase Cancelled",
        description: "Your credit purchase was cancelled.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/profile');
    }
  }, [toast, refreshUser]);

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/delete-account", {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account has been deleted. You will be logged out shortly.",
      });
      // Log out after a short delay
      setTimeout(() => {
        logout();
        setLocation("/");
      }, 2000);
    },
    onError: (error: any) => {
      setShowDeleteConfirm(false);
      if (error.hasActiveSubscription) {
        toast({
          title: "Active Subscription",
          description: "Please downgrade to the Free plan from the Plans page before deleting your account.",
          variant: "destructive",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/plans")}
            >
              Go to Plans
            </Button>
          ) as any,
        });
      } else {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete account",
          variant: "destructive",
        });
      }
    },
  });

  const handleUsernameUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }
    
    if (username === user?.username) {
      setError("New username must be different from current username");
      return;
    }
    
    updateUsernameMutation.mutate(username.trim());
  };

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long");
      return;
    }
    
    updatePasswordMutation.mutate({
      currentPassword,
      newPassword
    });
  };

  return (
    <div className="min-h-screen" data-testid="profile-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16" 
                data-testid="app-logo"
              />
              <nav className="flex items-center space-x-4">
                <Link href="/">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <HomeIcon className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </Link>
                <Link href="/my-songs">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Music className="h-4 w-4 mr-2" />
                    My Songs
                  </Button>
                </Link>
                <Link href="/my-videos">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Video className="h-4 w-4 mr-2" />
                    My Videos
                  </Button>
                </Link>
                <Link href="/plans">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Plans
                  </Button>
                </Link>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Avatar className="h-6 w-6">
                  {user?.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.username} />
                  ) : (
                    <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-secondary/20">
                      {user?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="text-sm text-muted-foreground">{user?.username}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
                data-testid="logout-button"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>
            </Link>
            <h1 className="text-3xl font-bold gradient-text mb-2">User Profile</h1>
            <p className="text-muted-foreground">
              Manage your account settings and preferences
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription data-testid="error-message">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {/* Avatar Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Avatar
                </CardTitle>
                <CardDescription>
                  Choose a profile picture from the available options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Current Avatar */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20">
                      {user?.avatarUrl ? (
                        <AvatarImage 
                          src={getDisplayAvatarUrl(user.avatarUrl) || user.avatarUrl} 
                          alt={user.username}
                          data-testid="current-avatar-image"
                        />
                      ) : (
                        <AvatarFallback className="text-xl bg-gradient-to-br from-primary/20 to-secondary/20">
                          {user?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">Current Avatar</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.avatarUrl ? "Custom avatar selected" : "Default initial avatar"}
                      </p>
                    </div>
                  </div>

                  {/* Avatar Selection Grid */}
                  <div>
                    <Label className="text-sm font-medium">Choose New Avatar</Label>
                    
                    {avatarsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-sm text-muted-foreground">Loading avatar options...</div>
                      </div>
                    )}
                    
                    {avatarsError && (
                      <Alert className="mt-2">
                        <AlertDescription>
                          Unable to load avatar options. Using default avatars.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {!avatarsLoading && (
                      <>
                        <div className="grid grid-cols-10 gap-2 mt-2">
                          {avatarOptions.map((avatar, index) => (
                            <button
                              key={avatar.id}
                              onClick={() => handleAvatarSelect(avatar.localUrl)} // Use localUrl for database storage
                              disabled={updateAvatarMutation.isPending}
                              className={`relative h-12 w-12 rounded-full overflow-hidden border-2 transition-all hover:scale-105 ${
                                user?.avatarUrl === avatar.localUrl 
                                  ? "border-primary ring-2 ring-primary/20" 
                                  : "border-border hover:border-primary/50"
                              }`}
                              data-testid={`avatar-option-${avatar.id}`}
                            >
                              <img
                                src={avatar.url} // Use production-safe URL for display
                                alt={`Avatar option ${avatar.id}`}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  // If production URL fails, try fallback local URL
                                  const img = e.target as HTMLImageElement;
                                  if (img.src !== avatar.localUrl) {
                                    console.warn(`Avatar ${avatar.id} failed to load from ${img.src}, trying fallback`);
                                    img.src = avatar.localUrl;
                                  } else {
                                    // Both URLs failed, hide the image
                                    img.style.display = 'none';
                                  }
                                }}
                                loading="lazy" // Lazy load images for better performance
                              />
                              {user?.avatarUrl === avatar.localUrl && (
                                <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                                  <div className="h-2 w-2 bg-primary rounded-full" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          Click on any avatar to select it as your profile picture
                          {avatarsError && " (Using fallback avatars)"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Public Profile Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" />
                  Public Profile
                </CardTitle>
                <CardDescription>
                  Share your public profile link with others to showcase your videos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-2">Your public profile URL:</p>
                      <code className="text-sm bg-muted px-2 py-1 rounded break-all">
                        https://neonvideo.ai/u/{user?.username}
                      </code>
                    </div>
                    <Link href={`/u/${user?.username}`} className="sm:shrink-0">
                      <Button variant="outline" data-testid="button-view-public-profile" className="w-full sm:w-auto">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Public Profile
                      </Button>
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only completed videos will be visible on your public profile
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Credit Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Credit Usage
                </CardTitle>
                <CardDescription>
                  Track your credit consumption and plan limits
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Plan Information */}
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Current Plan</span>
                      <span className="text-lg font-bold gradient-text">
                        {user?.plan?.name || "Free"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Credits</span>
                      <span className="text-sm font-medium">
                        {((user?.creditsUsed || 0) + (user?.creditsRemaining || 0)).toLocaleString() || "2,500"}
                      </span>
                    </div>
                  </div>

                  {/* Credit Usage Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Credits Used</span>
                      <span className="font-medium">
                        {user?.creditsUsed?.toLocaleString() || "0"} / {((user?.creditsUsed || 0) + (user?.creditsRemaining || 0)).toLocaleString() || "2,500"}
                      </span>
                    </div>
                    <div className="h-3 bg-secondary/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                        style={{ 
                          width: `${Math.min(100, ((user?.creditsUsed || 0) / ((user?.creditsUsed || 0) + (user?.creditsRemaining || 0) || 2500)) * 100)}%` 
                        }}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {user?.creditsRemaining?.toLocaleString() || "2,500"} credits remaining
                    </div>
                  </div>

                  {/* Credit Usage Breakdown */}
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium mb-2">Credit Costs:</p>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>• Song Generation</span>
                        <span>500 credits</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Video (30 seconds)</span>
                        <span>1,000 credits</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Video (1 minute)</span>
                        <span>2,000 credits</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Video (2+ minutes)</span>
                        <span>2,000 credits</span>
                      </div>
                    </div>
                  </div>

                  {/* Upgrade Button if on Free plan */}
                  {(!user?.plan || user?.plan?.name === "Free") && (
                    <div className="pt-2">
                      <Link href="/plans">
                        <Button className="w-full" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Upgrade to Get More Credits
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Subscription Management for Paid Users */}
            {user?.plan && user?.plan?.name !== "Free" && (
              <>
                <Separator />
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Subscription Management
                    </CardTitle>
                    <CardDescription>
                      Manage your subscription and billing settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Subscription Status */}
                      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {subscriptionData?.cancelAtPeriodEnd ? (
                            <XCircle className="h-5 w-5 text-orange-500" />
                          ) : (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          <div>
                            <p className="font-medium">
                              {subscriptionData?.cancelAtPeriodEnd 
                                ? "Subscription will cancel" 
                                : `${user.plan.name} Plan Active`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {subscriptionData?.currentPeriodEnd 
                                ? `${subscriptionData.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on ${new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()}`
                                : "Status: Active"
                              }
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Cancellation Notice */}
                      {subscriptionData?.cancelAtPeriodEnd && (
                        <Alert className="border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100">
                          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          <AlertDescription className="text-orange-900 dark:text-orange-100">
                            Your subscription is scheduled to cancel at the end of your current billing period. 
                            You will retain access to your paid plan until then.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Cancel Subscription - only show if they have an active Stripe subscription */}
                      {subscriptionData?.hasSubscription && !subscriptionData?.cancelAtPeriodEnd && (
                        <>
                          {!showCancelConfirm ? (
                            <Button
                              variant="outline"
                              className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                              onClick={() => setShowCancelConfirm(true)}
                              data-testid="button-cancel-subscription"
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancel Subscription
                            </Button>
                          ) : (
                            <div className="space-y-3">
                              <Alert className="border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
                                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <AlertDescription className="text-red-900 dark:text-red-100">
                                  <strong>Are you sure you want to cancel your subscription?</strong>
                                  <br />
                                  Your subscription will remain active until the end of your current billing period, 
                                  after which you'll be downgraded to the free plan.
                                </AlertDescription>
                              </Alert>
                              <div className="flex space-x-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setShowCancelConfirm(false)}
                                  className="flex-1"
                                  data-testid="button-cancel-confirm-no"
                                >
                                  Keep Subscription
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => cancelSubscriptionMutation.mutate()}
                                  disabled={cancelSubscriptionMutation.isPending}
                                  className="flex-1"
                                  data-testid="button-cancel-confirm-yes"
                                >
                                  {cancelSubscriptionMutation.isPending ? "Cancelling..." : "Yes, Cancel"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Notice for manually upgraded users */}
                      {!subscriptionData?.hasSubscription && (
                        <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                          <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <AlertDescription className="text-blue-900 dark:text-blue-100">
                            Your account was upgraded manually by an administrator. 
                            To cancel or modify your subscription, please contact support.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Buy Additional Credits - Only for Paid Subscribers */}
                <Separator />
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Coins className="h-5 w-5" />
                      Buy Additional Credits
                    </CardTitle>
                    <CardDescription>
                      Purchase credits to create more AI music videos
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Credit Package */}
                      <div className="border border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-2xl font-bold">5,000 Credits</h3>
                            <p className="text-sm text-muted-foreground">One-time purchase</p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold text-primary">$9</p>
                            <p className="text-xs text-muted-foreground">No subscription</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm text-muted-foreground mb-4">
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Create up to 5 songs (500 credits each)
                          </p>
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Generate 5 short videos (1,000 credits each)
                          </p>
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Or 2-3 long videos (2,000 credits each)
                          </p>
                        </div>

                        <Button 
                          className="w-full" 
                          size="lg"
                          onClick={() => buyCreditsMutation.mutate()}
                          disabled={buyCreditsMutation.isPending}
                          data-testid="button-buy-credits"
                        >
                          {buyCreditsMutation.isPending ? (
                            "Processing..."
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Purchase 5,000 Credits - $9
                            </>
                          )}
                        </Button>
                      </div>

                      <p className="text-xs text-center text-muted-foreground">
                        Credits are added instantly to your account after payment
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <Separator />
            {/* Username Update */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Update Username
                </CardTitle>
                <CardDescription>
                  Change your display name that appears throughout the application
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUsernameUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter new username"
                      data-testid="input-username"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={updateUsernameMutation.isPending}
                    data-testid="button-update-username"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateUsernameMutation.isPending ? "Updating..." : "Update Username"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Separator />

            {/* Password Reset */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Reset Password
                </CardTitle>
                <CardDescription>
                  Change your account password for security
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      data-testid="input-current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      data-testid="input-new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      data-testid="input-confirm-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={updatePasswordMutation.isPending}
                    data-testid="button-update-password"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Separator />

            {/* Delete Account */}
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Trash2 className="h-5 w-5" />
                  Delete Account
                </CardTitle>
                <CardDescription>
                  Permanently delete your account and all associated data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!showDeleteConfirm ? (
                  <>
                    <Alert className="border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      <AlertDescription className="text-red-900 dark:text-red-100">
                        <strong>Warning:</strong> This action cannot be undone. Deleting your account will:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Permanently delete your profile</li>
                          <li>Make all your generated videos inaccessible</li>
                          <li>Remove all your account data</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => setShowDeleteConfirm(true)}
                      data-testid="button-delete-account"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete My Account
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <Alert className="border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      <AlertDescription className="text-red-900 dark:text-red-100">
                        <strong>Are you absolutely sure?</strong>
                        <br />
                        All of your videos will become inaccessible and your account will be permanently deleted. 
                        This action cannot be undone.
                        {user?.plan?.name !== "Free" && (
                          <>
                            <br /><br />
                            <strong>Note:</strong> You have an active subscription. Please downgrade to the Free plan 
                            from the <Link href="/plans" className="underline text-red-800 dark:text-red-200">Plans page</Link> before deleting your account.
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1"
                        data-testid="button-delete-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => deleteAccountMutation.mutate()}
                        disabled={deleteAccountMutation.isPending}
                        className="flex-1"
                        data-testid="button-delete-confirm"
                      >
                        {deleteAccountMutation.isPending ? "Deleting..." : "Yes, Delete My Account"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}