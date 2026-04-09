import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Coins, CreditCard, Sparkles } from "lucide-react";
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

export default function PlansPage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

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
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
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

  const BASIC_TRIAL_PLAN_ID = '9f518d2b-d15e-4afe-b48d-3f584dbbcc49';

  // Detect if user is on Free plan (no active subscription, plan name is Free or no plan)
  const isOnFreePlan = user && (
    !user.plan || 
    user.plan.name.toLowerCase() === 'free' || 
    (!subscriptionStatus?.hasSubscription && user.plan.credits === 0)
  );

  // Show trial prompt from URL param (post-registration redirect)
  const showTrialPrompt = new URLSearchParams(window.location.search).get('trial') === '1';

  const handleSelectPlan = (plan: Plan, billingPeriod: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) {
      navigate("/auth");
    } else {
      // For yearly-only plans (monthlyPrice is null), always use yearly billing
      const effectiveBillingPeriod = plan.monthlyPrice === null ? 'yearly' : billingPeriod;
      
      setSelectedPlanId(plan.id);
      createCheckoutSession.mutate({ planId: plan.id, billingPeriod: effectiveBillingPeriod });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Separate regular plans (with monthly price) from yearly-only plans
  const regularPlans = plans?.filter(p => p.monthlyPrice !== null).sort((a, b) => (a.monthlyPrice ?? 0) - (b.monthlyPrice ?? 0)) || [];
  const yearlyOnlyPlans = plans?.filter(p => p.monthlyPrice === null).sort((a, b) => a.yearlyPrice - b.yearlyPrice) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      <NavigationHeader currentPage="plans" />

      <div className="container mx-auto px-4 py-16">
        {/* Trial prompt banner for free-plan users */}
        {(isOnFreePlan || showTrialPrompt) && (
          <div className="max-w-2xl mx-auto mb-8 p-6 rounded-xl border-2 border-primary/40 bg-gradient-to-r from-primary/10 to-purple-500/10">
            <div className="flex items-center gap-3 mb-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">Try NeonVideo for just $1</h2>
            </div>
            <p className="text-muted-foreground">
              Get started with the Basic plan for just $1. You'll receive 4,000 credits to create amazing AI music videos.
            </p>
          </div>
        )}

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
          {regularPlans.map((plan, index) => {
            // Mark the second plan as popular (if there are at least 2 plans)
            const isPopular = index === 1 && regularPlans.length > 1;
            const isTrialPlan = plan.id === BASIC_TRIAL_PLAN_ID;
            
            // User is on this plan if they have an active subscription for it OR database plan matches
            const isCurrentPlan = (subscriptionStatus?.planId === plan.id && subscriptionStatus?.hasSubscription) || 
                (user?.plan?.id === plan.id && subscriptionStatus?.hasSubscription);
            
            return (
              <Card 
                key={plan.id} 
                className={`relative overflow-hidden transition-all hover:shadow-xl ${
                  isPopular ? 'border-primary shadow-lg scale-105' : ''
                } ${isTrialPlan && !isPopular ? 'border-emerald-500/50 shadow-md' : ''
                } ${isCurrentPlan ? 'border-green-500 bg-green-50/5' : ''}`}
                data-testid={`plan-card-${plan.id}`}
              >
                {isTrialPlan && !isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white px-3 py-1 text-xs font-bold rounded-bl-lg">
                    $1 TRIAL
                  </div>
                )}
                {isPopular && !isCurrentPlan && !isTrialPlan && (
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
                  {isTrialPlan && !isCurrentPlan && (
                    <div className="text-xs font-semibold text-emerald-500 mb-2">
                      Try for just $1
                    </div>
                  )}
                  <CardDescription className="text-sm mb-4">
                    Perfect for {index === 0 ? 'getting started' : index === regularPlans.length - 1 ? 'professional creators' : 'growing creators'}
                  </CardDescription>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">
                      ${billingPeriod === 'monthly' 
                        ? ((plan.monthlyPrice ?? 0) / 100).toFixed(0)
                        : plan.yearlyPrice 
                          ? (plan.yearlyPrice / 100).toFixed(0)
                          : ((plan.monthlyPrice ?? 0) * 12 / 100).toFixed(0)
                      }
                    </span>
                    <span className="text-muted-foreground">
                      /{billingPeriod === 'monthly' ? 'month' : 'year'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {plan.credits.toLocaleString()} credits included
                  </div>
                  {billingPeriod === 'yearly' && plan.yearlyPrice && plan.monthlyPrice && (
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
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2">
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
                    ) : isTrialPlan ? (
                      user ? 'Start $1 Trial' : 'Sign up & Start $1 Trial'
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

        {/* Yearly-Only Plans Section */}
        {yearlyOnlyPlans.length > 0 && (
          <div className="mt-12">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold gradient-text mb-2">Special Plans</h2>
              <p className="text-muted-foreground">Exclusive yearly subscription options</p>
            </div>
            <div className="flex justify-center">
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 max-w-4xl">
                {yearlyOnlyPlans.map((plan) => {
                  const isCurrentPlan = (subscriptionStatus?.planId === plan.id && subscriptionStatus?.hasSubscription) || 
                    (user?.plan?.id === plan.id);
                  
                  return (
                    <Card 
                      key={plan.id} 
                      className={`relative overflow-hidden transition-all hover:shadow-xl border-2 border-purple-500/50 bg-gradient-to-br from-purple-500/5 to-primary/5 w-full sm:w-80 ${
                        isCurrentPlan ? 'border-green-500 bg-green-50/5' : ''
                      }`}
                      data-testid={`plan-card-${plan.id}`}
                    >
                      <div className="absolute top-0 right-0 bg-purple-600 text-white px-3 py-1 text-xs font-bold rounded-bl-lg">
                        {isCurrentPlan ? 'CURRENT PLAN' : 'YEARLY ONLY'}
                      </div>
                      
                      <CardHeader className="text-center pb-8">
                        <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                        <CardDescription className="text-sm mb-4">
                          Ultimate plan for power users
                        </CardDescription>
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-4xl font-bold">
                            ${(plan.yearlyPrice / 100).toFixed(0)}
                          </span>
                          <span className="text-muted-foreground">/year</span>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {plan.credits.toLocaleString()} credits included
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        <ul className="space-y-3">
                          {plan.features.map((feature, featureIndex) => (
                            <li key={featureIndex} className="flex items-start gap-2">
                              <Check className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                        
                        <Button 
                          className="w-full bg-purple-600 hover:bg-purple-700"
                          onClick={() => handleSelectPlan(plan, 'yearly')}
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
                            user ? 'Get Started' : 'Sign up Now'
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {regularPlans.length === 0 && yearlyOnlyPlans.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No plans available at the moment. Please check back later.
            </p>
          </div>
        )}

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
                        <p className="text-sm font-medium">Unlimited Songs</p>
                        <p className="text-xs text-green-500">Free</p>
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