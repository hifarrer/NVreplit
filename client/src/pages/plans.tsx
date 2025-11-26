import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles, Copy, CheckCircle2, Coins, CreditCard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plan } from "@shared/schema";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

// Declare gtag_report_conversion function globally
declare global {
  interface Window {
    gtag_report_conversion: (url?: string) => boolean;
  }
}

export default function PlansPage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Add conversion tracking script
  useEffect(() => {
    const script = document.createElement('script');
    script.innerHTML = `
      function gtag_report_conversion(url) {
        if (url) {
          try {
            if (typeof gtag === 'function') {
              let redirected = false;
              var callback = function () {
                if (!redirected) {
                  redirected = true;
                  window.location = url;
                }
              };
              // Fallback timeout if callback never fires
              setTimeout(callback, 800);
              gtag('event', 'conversion', {
                  'send_to': 'AW-17548478207/UEmACLiqy5kbEP-N4q9B',
                  'value': 1.0,
                  'currency': 'USD',
                  'transaction_id': '',
                  'event_callback': callback
              });
            } else {
              window.location = url;
            }
          } catch (error) {
            console.warn('Google Analytics conversion tracking failed:', error);
            window.location = url;
          }
        }
        return false;
      }
      window.gtag_report_conversion = gtag_report_conversion;
    `;
    document.head.appendChild(script);

    return () => {
      // Cleanup script on component unmount
      document.head.removeChild(script);
    };
  }, []);
  
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  // Get user's subscription status
  const { data: subscriptionStatus } = useQuery<{
    hasSubscription: boolean;
    planId?: string;
    status?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  }>({
    queryKey: ["/api/stripe/subscription-status"],
    enabled: !!user,
  });

  // Mutation to create checkout session
  const createCheckoutSession = useMutation({
    mutationFn: async ({ planId, billingPeriod }: { planId: string; billingPeriod: 'monthly' | 'yearly' }) => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout-session", {
        planId,
        billingPeriod
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Track conversion when checkout session is successfully created
      if (data.sessionUrl) {
        try {
          if (window.gtag_report_conversion) {
            window.gtag_report_conversion(data.sessionUrl);
          } else {
            window.location.href = data.sessionUrl;
          }
        } catch (error) {
          console.warn('Conversion tracking failed, proceeding to checkout:', error);
          window.location.href = data.sessionUrl;
        }
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
      setSelectedPlanId(null);
    }
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
      window.history.replaceState({}, '', '/plans');
    } else if (creditPurchaseStatus === 'cancelled') {
      toast({
        title: "Purchase Cancelled",
        description: "Your credit purchase was cancelled.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/plans');
    }
  }, [toast, refreshUser]);

  const handleSelectPlan = (plan: Plan, billingPeriod: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) {
      navigate("/auth");
    } else {
      // Skip checkout for free plan (using price-based detection)
      if (plan.monthlyPrice === 0) {
        toast({
          title: "Free Plan",
          description: "You already have access to the free plan!",
        });
        return;
      }
      
      setSelectedPlanId(plan.id);
      createCheckoutSession.mutate({ planId: plan.id, billingPeriod });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Sort plans by monthly price
  const sortedPlans = plans?.sort((a, b) => a.monthlyPrice - b.monthlyPrice) || [];

  const copyPromoCode = (code: string, planName: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({
      title: "Promo code copied!",
      description: `${code} for ${planName} plan has been copied to your clipboard`,
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      <NavigationHeader currentPage="plans" />

      {/* Black Friday Promo Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-gray-900 via-red-900 to-gray-900 animate-gradient-x">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        <div className="container mx-auto px-4 py-6 relative z-10">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-2 animate-pulse">
              <Sparkles className="w-8 h-8 text-yellow-400 drop-shadow-glow" />
              <Sparkles className="w-6 h-6 text-red-400 drop-shadow-glow" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg mb-1 animate-bounce-subtle">
                🖤 BLACK FRIDAY SALE 🖤
              </h2>
              <p className="text-white/90 text-sm md:text-base">
                Limited time only! Use these codes at checkout for exclusive savings
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 backdrop-blur-sm border-2 border-yellow-400/60 rounded-lg px-4 py-3 shadow-xl">
                  <div className="text-xs text-yellow-300 mb-1 font-semibold">BASIC PLAN - JUST $5</div>
                  <div className="text-xl font-black text-white tracking-wider drop-shadow-lg" data-testid="promo-code-basic">
                    BFNEON5
                  </div>
                </div>
                <Button
                  onClick={() => copyPromoCode('BFNEON5', 'Basic')}
                  variant="secondary"
                  size="sm"
                  className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  data-testid="copy-promo-code-basic"
                >
                  {copiedCode === 'BFNEON5' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white/20 backdrop-blur-sm border-2 border-red-400/60 rounded-lg px-4 py-3 shadow-xl">
                  <div className="text-xs text-red-300 mb-1 font-semibold">PREMIUM PLAN - JUST $25</div>
                  <div className="text-xl font-black text-white tracking-wider drop-shadow-lg" data-testid="promo-code-premium">
                    BFNEON25
                  </div>
                </div>
                <Button
                  onClick={() => copyPromoCode('BFNEON25', 'Premium')}
                  variant="secondary"
                  size="sm"
                  className="bg-red-500 hover:bg-red-400 text-white font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  data-testid="copy-promo-code-premium"
                >
                  {copiedCode === 'BFNEON25' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 animate-pulse">
              <Sparkles className="w-6 h-6 text-red-400 drop-shadow-glow" />
              <Sparkles className="w-8 h-8 text-yellow-400 drop-shadow-glow" />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold gradient-text mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start creating amazing AI-powered music videos with our flexible pricing plans
          </p>
          
          {/* Billing Period Toggle */}
          <div className="flex items-center justify-center gap-4 mt-8 p-4 bg-muted/30 rounded-lg max-w-sm mx-auto">
            <Label htmlFor="billing-toggle" className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>
              Monthly
            </Label>
            <Switch
              id="billing-toggle"
              checked={billingPeriod === 'yearly'}
              onCheckedChange={(checked) => setBillingPeriod(checked ? 'yearly' : 'monthly')}
              data-testid="billing-period-toggle"
            />
            <Label htmlFor="billing-toggle" className={`text-sm font-medium ${billingPeriod === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}`}>
              <span>Yearly</span>
              <span className="text-green-600 text-xs ml-1">(Save up to 20%)</span>
            </Label>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-4xl">
          {sortedPlans.map((plan, index) => {
            // Mark the second plan as popular (if there are at least 2 plans)
            const isPopular = index === 1 && sortedPlans.length > 1;
            
            // For Free plan: user is on it if they don't have an active subscription AND no database plan
            // For paid plans: user is on it if they have an active subscription for that plan OR database plan matches
            const isCurrentPlan = plan.name.toLowerCase() === 'free' 
              ? user && !subscriptionStatus?.hasSubscription && !user.plan
              : (subscriptionStatus?.planId === plan.id && subscriptionStatus?.hasSubscription) || 
                (user?.plan?.id === plan.id);
            
            return (
              <Card 
                key={plan.id} 
                className={`relative overflow-hidden transition-all hover:shadow-xl ${
                  isPopular ? 'border-primary shadow-lg scale-105' : ''
                } ${isCurrentPlan ? 'border-green-500 bg-green-50/5' : ''}`}
                data-testid={`plan-card-${plan.id}`}
              >
                {isPopular && !isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-bold rounded-bl-lg">
                    MOST POPULAR
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-bl-lg">
                    CURRENT PLAN
                  </div>
                )}
                
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                  <CardDescription className="text-sm mb-4">
                    Perfect for {index === 0 ? 'getting started' : index === sortedPlans.length - 1 ? 'professional creators' : 'growing creators'}
                  </CardDescription>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">
                      ${billingPeriod === 'monthly' 
                        ? (plan.monthlyPrice / 100).toFixed(0)
                        : plan.yearlyPrice 
                          ? (plan.yearlyPrice / 100).toFixed(0)
                          : (plan.monthlyPrice * 12 / 100).toFixed(0)
                      }
                    </span>
                    <span className="text-muted-foreground">
                      /{billingPeriod === 'monthly' ? 'month' : 'year'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {plan.credits} credits included
                  </div>
                  {billingPeriod === 'yearly' && plan.yearlyPrice && (
                    <div className="mt-1 text-xs text-green-600">
                      Save ${((plan.monthlyPrice * 12 - plan.yearlyPrice) / 100).toFixed(0)} compared to monthly
                    </div>
                  )}
                  {billingPeriod === 'monthly' && plan.yearlyPrice && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      ${(plan.yearlyPrice / 100).toFixed(0)}/year available
                    </div>
                  )}
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full ${isPopular ? 'bg-primary hover:bg-primary/90' : ''}`}
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan, billingPeriod)}
                    disabled={
                      (createCheckoutSession.isPending && selectedPlanId === plan.id) ||
                      Boolean(isCurrentPlan)
                    }
                    data-testid={`select-plan-${plan.id}`}
                  >
                    {createCheckoutSession.isPending && selectedPlanId === plan.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Redirecting to checkout...
                      </>
                    ) : isCurrentPlan ? (
                      'Current Plan'
                    ) : (
                      user ? 'Upgrade' : 'Sign up Now'
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </div>

        {sortedPlans.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No plans available at the moment. Please check back later.
            </p>
          </div>
        )}

        <div className="mt-12 sm:mt-16 text-center">
          <h2 className="text-xl sm:text-2xl font-semibold mb-4">All Plans Include</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
            <div className="flex flex-col items-center p-4">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-3">
                <i className="fas fa-music text-primary"></i>
              </div>
              <h3 className="font-semibold mb-2">AI Music Generation</h3>
              <p className="text-sm text-muted-foreground">
                Create original songs with ElevenLabs AI
              </p>
            </div>
            <div className="flex flex-col items-center p-4">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-3">
                <i className="fas fa-video text-primary"></i>
              </div>
              <h3 className="font-semibold mb-2">Video Creation</h3>
              <p className="text-sm text-muted-foreground">
                Generate stunning music videos with AI
              </p>
            </div>
            <div className="flex flex-col items-center p-4">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-3">
                <i className="fas fa-cloud text-primary"></i>
              </div>
              <h3 className="font-semibold mb-2">Cloud Storage</h3>
              <p className="text-sm text-muted-foreground">
                Save and access your creations anytime
              </p>
            </div>
          </div>
        </div>

        {/* Buy Additional Credits - Only for Paid Subscribers */}
        {user && user.plan && user.plan.name !== "Free" && (
          <div className="mt-16">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold gradient-text mb-2">Need More Credits?</h2>
              <p className="text-lg text-muted-foreground">
                Purchase additional credits anytime to keep creating
              </p>
            </div>
            
            <div className="max-w-2xl mx-auto">
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 shadow-xl">
                <CardHeader className="text-center pb-4">
                  <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    <Coins className="h-6 w-6 text-primary" />
                    Credit Booster Pack
                  </CardTitle>
                  <CardDescription className="text-base">
                    One-time purchase for existing subscribers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-background/50 rounded-lg p-6 border border-primary/10">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-3xl font-bold">5,000 Credits</h3>
                        <p className="text-sm text-muted-foreground">Instant delivery</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-bold text-primary">$9</p>
                        <p className="text-xs text-muted-foreground">One-time payment</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      <div className="flex flex-col items-center p-3 bg-primary/5 rounded-lg">
                        <Check className="h-5 w-5 text-green-500 mb-2" />
                        <p className="text-sm font-medium">5 AI Songs</p>
                        <p className="text-xs text-muted-foreground">500 credits each</p>
                      </div>
                      <div className="flex flex-col items-center p-3 bg-primary/5 rounded-lg">
                        <Check className="h-5 w-5 text-green-500 mb-2" />
                        <p className="text-sm font-medium">5 Short Videos</p>
                        <p className="text-xs text-muted-foreground">1,000 credits each</p>
                      </div>
                      <div className="flex flex-col items-center p-3 bg-primary/5 rounded-lg">
                        <Check className="h-5 w-5 text-green-500 mb-2" />
                        <p className="text-sm font-medium">2-3 Long Videos</p>
                        <p className="text-xs text-muted-foreground">2,000 credits each</p>
                      </div>
                    </div>

                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => buyCreditsMutation.mutate()}
                      disabled={buyCreditsMutation.isPending}
                      data-testid="button-buy-credits-plans"
                    >
                      {buyCreditsMutation.isPending ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-5 w-5 mr-2" />
                          Buy 5,000 Credits for $9
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-xs text-center text-muted-foreground">
                    ✨ Credits are added instantly to your account after payment
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>Questions about our plans? <a href="/contact" className="text-primary hover:underline">Contact us</a></p>
        </div>
      </div>
      <Footer />
    </div>
  );
}