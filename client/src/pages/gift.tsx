import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, Gift, ArrowRight, Sparkles } from "lucide-react";
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
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const giftFormSchema = z.object({
  recipientEmail: z.string().email("Please enter a valid email address"),
  recipientName: z.string().optional(),
  personalMessage: z.string().max(500, "Message must be less than 500 characters").optional(),
});

type GiftFormValues = z.infer<typeof giftFormSchema>;

export default function GiftPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [step, setStep] = useState<'select-plan' | 'recipient-details'>('select-plan');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<GiftFormValues>({
    resolver: zodResolver(giftFormSchema),
    defaultValues: {
      recipientEmail: "",
      recipientName: "",
      personalMessage: "",
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled') === 'true') {
      toast({
        title: "Gift Purchase Cancelled",
        description: "Your gift purchase was cancelled.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/gift');
    }
  }, [toast]);
  
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const createGiftCheckout = useMutation({
    mutationFn: async (data: { planId: string; billingPeriod: string; recipientEmail: string; recipientName?: string; personalMessage?: string }) => {
      const res = await apiRequest("POST", "/api/stripe/gift/create-checkout-session", data);
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
      setIsSubmitting(false);
    }
  });

  const handleSelectPlan = (planId: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setSelectedPlanId(planId);
    setStep('recipient-details');
  };

  const onSubmit = async (values: GiftFormValues) => {
    if (!selectedPlanId) return;
    
    setIsSubmitting(true);
    createGiftCheckout.mutate({
      planId: selectedPlanId,
      billingPeriod,
      recipientEmail: values.recipientEmail,
      recipientName: values.recipientName || undefined,
      personalMessage: values.personalMessage || undefined,
    });
  };

  const formatPrice = (priceInCents: number) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  const paidPlans = plans?.filter(plan => 
    (plan.monthlyPrice && plan.monthlyPrice > 0) || 
    (plan.yearlyPrice && plan.yearlyPrice > 0)
  );

  const selectedPlan = plans?.find(p => p.id === selectedPlanId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <NavigationHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4 bg-primary/10 px-4 py-2 rounded-full">
            <Gift className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">Gift a Subscription</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">Give the Gift of Creativity</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {step === 'select-plan' 
              ? "Select a plan to gift. The recipient will receive an email with a redemption link."
              : "Enter the recipient's details and add a personal message."}
          </p>
        </div>

        {step === 'select-plan' && (
          <>
            <div className="flex items-center justify-center gap-4 mb-8">
              <Label htmlFor="billing-period" className={billingPeriod === 'monthly' ? 'font-semibold' : 'text-muted-foreground'}>
                Monthly
              </Label>
              <Switch
                id="billing-period"
                checked={billingPeriod === 'yearly'}
                onCheckedChange={(checked) => setBillingPeriod(checked ? 'yearly' : 'monthly')}
                data-testid="switch-billing-period"
              />
              <Label htmlFor="billing-period" className={billingPeriod === 'yearly' ? 'font-semibold' : 'text-muted-foreground'}>
                Yearly
                <span className="ml-2 text-xs text-green-500 font-normal">Save up to 50%</span>
              </Label>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {paidPlans?.map((plan) => {
                const price = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                if (!price) return null;
                
                return (
                  <Card 
                    key={plan.id} 
                    className="relative overflow-hidden hover:shadow-lg transition-shadow"
                    data-testid={`card-plan-${plan.id}`}
                  >
                    {plan.name === 'Premium' && (
                      <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold rounded-bl-lg">
                        <Sparkles className="inline-block w-3 h-3 mr-1" />
                        Popular
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="text-2xl">{plan.name}</CardTitle>
                      <CardDescription>
                        <span className="text-3xl font-bold text-foreground">{formatPrice(price)}</span>
                        <span className="text-muted-foreground">/{billingPeriod === 'yearly' ? 'year' : 'month'}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          <span>{plan.credits.toLocaleString()} credits{billingPeriod === 'yearly' ? '/year' : '/month'}</span>
                        </li>
                        {Array.isArray(plan.features) && plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        className="w-full" 
                        variant={plan.name === 'Premium' ? 'default' : 'outline'}
                        onClick={() => handleSelectPlan(plan.id)}
                        data-testid={`button-gift-${plan.id}`}
                      >
                        <Gift className="mr-2 h-4 w-4" />
                        Gift This Plan
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {step === 'recipient-details' && selectedPlan && (
          <div className="max-w-xl mx-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Gift Details</CardTitle>
                    <CardDescription>
                      Gifting: {selectedPlan.name} Plan ({billingPeriod === 'yearly' ? '1 Year' : '1 Month'})
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep('select-plan')} data-testid="button-change-plan">
                    Change Plan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="recipientEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recipient's Email *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="friend@example.com" 
                              type="email" 
                              {...field} 
                              data-testid="input-recipient-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="recipientName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recipient's Name (optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Their name" 
                              {...field} 
                              data-testid="input-recipient-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="personalMessage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Personal Message (optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Add a personal message for the recipient..."
                              className="resize-none"
                              rows={4}
                              {...field}
                              data-testid="textarea-personal-message"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            {field.value?.length || 0}/500 characters
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Total</span>
                        <span className="text-2xl font-bold">
                          {formatPrice(billingPeriod === 'yearly' ? selectedPlan.yearlyPrice : (selectedPlan.monthlyPrice || 0))}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        One-time payment. Gift can be redeemed within 1 year.
                      </p>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      size="lg"
                      disabled={isSubmitting}
                      data-testid="button-proceed-to-payment"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Proceed to Payment
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
