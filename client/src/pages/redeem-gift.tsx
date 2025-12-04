import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Gift, Check, AlertCircle, PartyPopper } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface GiftValidationResponse {
  valid: boolean;
  error?: string;
  recipientEmail?: string;
  recipientName?: string;
  personalMessage?: string;
  billingPeriod?: string;
  plan?: {
    name: string;
    credits: number;
  };
  expiresAt?: string;
}

interface RedeemResponse {
  success: boolean;
  message: string;
  plan?: {
    name: string;
    credits: number;
  };
  billingPeriod?: string;
}

export default function RedeemGiftPage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [giftCode, setGiftCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [redeemedPlan, setRedeemedPlan] = useState<{ name: string; credits: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');
    if (codeFromUrl) {
      setGiftCode(codeFromUrl);
    }
  }, []);

  const { data: giftInfo, isLoading: isValidating, error: validationError } = useQuery<GiftValidationResponse>({
    queryKey: ["/api/gifts/validate", giftCode],
    queryFn: async () => {
      const res = await fetch(`/api/gifts/validate/${giftCode}`);
      return res.json();
    },
    enabled: !!giftCode && giftCode.length > 5,
    retry: false,
  });

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/gifts/redeem", { code });
      return res.json() as Promise<RedeemResponse>;
    },
    onSuccess: (data) => {
      if (data.success) {
        setRedeemSuccess(true);
        setRedeemedPlan(data.plan || null);
        refreshUser();
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        toast({
          title: "Gift Redeemed!",
          description: data.message,
        });
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to redeem gift",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to redeem gift",
        variant: "destructive",
      });
    },
  });

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      setGiftCode(manualCode.trim().toUpperCase());
    }
  };

  const handleRedeem = () => {
    if (!user) {
      navigate(`/auth?redirect=/redeem-gift?code=${giftCode}`);
      return;
    }
    redeemMutation.mutate(giftCode);
  };

  if (redeemSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <NavigationHeader />
        
        <main className="container mx-auto px-4 py-16">
          <div className="max-w-lg mx-auto text-center">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <PartyPopper className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Gift Redeemed!</h1>
              <p className="text-muted-foreground text-lg">
                Congratulations! You now have access to the {redeemedPlan?.name || 'Premium'} plan.
              </p>
            </div>
            
            <Card className="text-left">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>Plan: <strong>{redeemedPlan?.name}</strong></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>Credits: <strong>{redeemedPlan?.credits?.toLocaleString()}</strong></span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="mt-8 space-x-4">
              <Button onClick={() => navigate("/create")} data-testid="button-start-creating">
                Start Creating
              </Button>
              <Button variant="outline" onClick={() => navigate("/profile")} data-testid="button-view-profile">
                View Profile
              </Button>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <NavigationHeader />
      
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Gift className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Redeem Your Gift</h1>
            <p className="text-muted-foreground">
              Enter your gift code or use the link from your email.
            </p>
          </div>

          {!giftCode && (
            <Card>
              <CardHeader>
                <CardTitle>Enter Gift Code</CardTitle>
                <CardDescription>
                  Your gift code looks like: GIFT-XXXXXXXXXX
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleManualCodeSubmit} className="space-y-4">
                  <Input
                    placeholder="GIFT-XXXXXXXXXX"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    className="font-mono text-center text-lg"
                    data-testid="input-gift-code"
                  />
                  <Button type="submit" className="w-full" data-testid="button-validate-code">
                    Validate Code
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {giftCode && isValidating && (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Validating your gift code...</p>
              </CardContent>
            </Card>
          )}

          {giftCode && !isValidating && giftInfo && !giftInfo.valid && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Invalid Gift Code</AlertTitle>
              <AlertDescription>
                {giftInfo.error || "This gift code is not valid. Please check and try again."}
              </AlertDescription>
            </Alert>
          )}

          {giftCode && !isValidating && giftInfo?.valid && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  You've Received a Gift!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {giftInfo.personalMessage && (
                  <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
                    <p className="italic text-muted-foreground">"{giftInfo.personalMessage}"</p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-semibold">{giftInfo.plan?.name}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-semibold">
                      {giftInfo.billingPeriod === 'yearly' ? '1 Year' : '1 Month'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Credits</span>
                    <span className="font-semibold">{giftInfo.plan?.credits?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Expires</span>
                    <span className="font-semibold">
                      {giftInfo.expiresAt ? new Date(giftInfo.expiresAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {!user && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Sign in Required</AlertTitle>
                    <AlertDescription>
                      You need to sign in or create an account to redeem this gift.
                    </AlertDescription>
                  </Alert>
                )}

                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleRedeem}
                  disabled={redeemMutation.isPending}
                  data-testid="button-redeem-gift"
                >
                  {redeemMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redeeming...
                    </>
                  ) : user ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Redeem Gift
                    </>
                  ) : (
                    "Sign In to Redeem"
                  )}
                </Button>

                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => {
                    setGiftCode("");
                    setManualCode("");
                  }}
                  data-testid="button-enter-different-code"
                >
                  Enter a Different Code
                </Button>
              </CardContent>
            </Card>
          )}

          {giftCode && !isValidating && validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Could not validate this gift code. Please try again.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
