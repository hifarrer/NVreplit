import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2, Gift } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";

export default function PaymentSuccessPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [referralCreditsAwarded, setReferralCreditsAwarded] = useState(false);
  
  // Get session ID from URL
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  
  // Process payment success and handle referrals
  useEffect(() => {
    if (sessionId && !paymentProcessed) {
      setPaymentProcessed(true);
      
      // Call our payment success endpoint to handle referral credits (authenticated)
      const authToken = localStorage.getItem('auth_token');
      if (authToken) {
        fetch(`/api/stripe/payment-success/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
          .then(response => response.json())
          .then(data => {
            if (data.success && data.referralCreditsAwarded) {
              setReferralCreditsAwarded(true);
            }
          })
          .catch(error => {
            console.error('Payment processing error:', error);
          });
      }
    }
  }, [sessionId, paymentProcessed]);
  
  // Get subscription status
  const { data: subscriptionStatus, isLoading } = useQuery({
    queryKey: ["/api/stripe/subscription-status"],
    enabled: !!user,
  });

  useEffect(() => {
    // If not logged in, redirect to auth
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Confirming your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      <NavigationHeader currentPage="" />
      
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Payment Successful!</CardTitle>
            <CardDescription>
              Your subscription has been activated successfully
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {subscriptionStatus?.hasSubscription && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground">Subscription Status</p>
                <p className="font-medium capitalize">
                  {subscriptionStatus.status === 'active' ? 'Active' : subscriptionStatus.status}
                </p>
                {subscriptionStatus.currentPeriodEnd && (
                  <>
                    <p className="text-sm text-muted-foreground mt-2">Next billing date</p>
                    <p className="font-medium">
                      {new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </>
                )}
              </div>
            )}
            
            {referralCreditsAwarded && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-green-600" />
                  <p className="font-medium text-green-800">Referral Bonus Awarded!</p>
                </div>
                <p className="text-sm text-green-700">
                  The person who referred you has earned 2500 credits as a thank you for bringing you to our platform!
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              <Button 
                className="w-full"
                onClick={() => navigate("/")}
                data-testid="button-go-to-dashboard"
              >
                Start Creating
              </Button>
              
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => navigate("/profile")}
                data-testid="button-view-subscription"
              >
                View Subscription Details
              </Button>
            </div>
            
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground text-center">
                Your credits have been added to your account and you can start creating amazing music videos right away!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Footer />
    </div>
  );
}