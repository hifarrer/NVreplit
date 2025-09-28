import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plan } from "@shared/schema";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

// Declare gtag_report_conversion function globally
declare global {
  interface Window {
    gtag_report_conversion: (url?: string) => boolean;
  }
}

export default function PlansPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      <NavigationHeader currentPage="plans" />

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

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>Questions about our plans? <a href="/contact" className="text-primary hover:underline">Contact us</a></p>
        </div>
      </div>
      <Footer />
    </div>
  );
}