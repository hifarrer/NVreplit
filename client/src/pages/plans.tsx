import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Plan } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function PlansPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const handleSelectPlan = (plan: Plan) => {
    if (!user) {
      navigate("/auth");
    } else {
      // In a real implementation, this would go to a checkout page
      alert(`Selected ${plan.name} plan - Checkout flow would go here`);
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold gradient-text mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start creating amazing AI-powered music videos with our flexible pricing plans
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {sortedPlans.map((plan, index) => {
            // Mark the second plan as popular (if there are at least 2 plans)
            const isPopular = index === 1 && sortedPlans.length > 1;
            
            return (
              <Card 
                key={plan.id} 
                className={`relative overflow-hidden transition-all hover:shadow-xl ${
                  isPopular ? 'border-primary shadow-lg scale-105' : ''
                }`}
                data-testid={`plan-card-${plan.id}`}
              >
                {isPopular && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-bold rounded-bl-lg">
                    MOST POPULAR
                  </div>
                )}
                
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                  <CardDescription className="text-sm mb-4">
                    Perfect for {index === 0 ? 'getting started' : index === sortedPlans.length - 1 ? 'professional creators' : 'growing creators'}
                  </CardDescription>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">
                      ${(plan.monthlyPrice / 100).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground">
                      /month
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {plan.credits} credits included
                  </div>
                  {plan.yearlyPrice && (
                    <div className="mt-1 text-xs text-green-600">
                      Save ${((plan.monthlyPrice * 12 - plan.yearlyPrice) / 100).toFixed(0)} yearly
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
                    onClick={() => handleSelectPlan(plan)}
                    data-testid={`select-plan-${plan.id}`}
                  >
                    {user ? 'Select Plan' : 'Sign Up'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {sortedPlans.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No plans available at the moment. Please check back later.
            </p>
          </div>
        )}

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-semibold mb-4">All Plans Include</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
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
    </div>
  );
}