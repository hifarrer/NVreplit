import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, DollarSign, Users, Share2, Edit2, Check, X, CreditCard, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { NavigationHeader } from "@/components/navigation-header";
import { Link } from "wouter";

interface AffiliateSignup {
  id: string;
  signupUserId: string;
  bonusCreditsAwarded: number;
  isCreditsAwarded: boolean;
  createdAt: string;
  username: string;
}

interface AffiliateEarning {
  id: string;
  signupUserId: string;
  subscriptionAmount: number;
  commissionAmount: number;
  subscriptionPeriod: string;
  planName: string;
  createdAt: string;
}

interface AffiliatePayout {
  id: string;
  requestedAmount: number;
  paypalEmail: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
}

interface AffiliateStats {
  totalSignups: number;
  totalEarnings: number;
  pendingBalance: number;
  totalPaidOut: number;
}

interface AffiliateData {
  signups: AffiliateSignup[];
  earnings: AffiliateEarning[];
  payouts: AffiliatePayout[];
  stats: AffiliateStats;
}

interface Affiliate {
  id: string;
  userId: string;
  affiliateCode: string;
  commissionRate: number;
  totalEarnings: number;
  totalPaidOut: number;
  paypalEmail: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function AffiliatesPage() {
  const { toast } = useToast();
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [showPayoutForm, setShowPayoutForm] = useState(false);

  // Fetch affiliate data
  const { data: affiliateData, isLoading: isLoadingAffiliate } = useQuery<AffiliateData>({
    queryKey: ["/api/affiliates"],
  });

  // Fetch affiliate profile
  const { data: affiliate, isLoading: isLoadingProfile } = useQuery<Affiliate>({
    queryKey: ["/api/affiliates/profile"],
  });

  // Update affiliate code mutation
  const updateCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest('POST', '/api/affiliates/code', { code });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update affiliate code');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Your affiliate code has been updated.",
      });
      setIsEditingCode(false);
      setNewCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update affiliate code",
        variant: "destructive",
      });
    },
  });

  // Request payout mutation
  const requestPayoutMutation = useMutation({
    mutationFn: async (data: { paypalEmail: string; requestedAmount: number }) => {
      const response = await apiRequest('POST', '/api/affiliates/payout', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to request payout');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Payout Requested!",
        description: "Your payout request has been submitted successfully.",
      });
      setShowPayoutForm(false);
      setPaypalEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/affiliates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to request payout",
        variant: "destructive",
      });
    },
  });

  const handleCopyAffiliateUrl = () => {
    if (!affiliate?.affiliateCode) return;
    
    const affiliateUrl = `${window.location.origin}/auth?aff=${affiliate.affiliateCode}`;
    navigator.clipboard.writeText(affiliateUrl);
    toast({
      title: "Copied!",
      description: "Affiliate link copied to clipboard",
    });
  };

  const handleEditCode = () => {
    setNewCode(affiliate?.affiliateCode || "");
    setIsEditingCode(true);
  };

  const handleSaveCode = () => {
    if (!newCode.trim()) return;
    updateCodeMutation.mutate(newCode.trim());
  };

  const handleCancelEdit = () => {
    setIsEditingCode(false);
    setNewCode("");
  };

  const handleRequestPayout = () => {
    if (!paypalEmail.trim() || !affiliateData?.stats.pendingBalance) return;
    requestPayoutMutation.mutate({
      paypalEmail: paypalEmail.trim(),
      requestedAmount: affiliateData.stats.pendingBalance
    });
  };

  if (isLoadingAffiliate || isLoadingProfile) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavigationHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid gap-6 md:grid-cols-3 mb-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stats = affiliateData?.stats || { totalSignups: 0, totalEarnings: 0, pendingBalance: 0, totalPaidOut: 0 };
  const signups = affiliateData?.signups || [];
  const earnings = affiliateData?.earnings || [];
  const payouts = affiliateData?.payouts || [];
  const affiliateCode = affiliate?.affiliateCode || "";
  const affiliateUrl = `${window.location.origin}/auth?aff=${affiliateCode}`;
  const canRequestPayout = stats.pendingBalance >= 1000; // $10 minimum (1000 cents)

  return (
    <div className="min-h-screen flex flex-col">
      <NavigationHeader />
      <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="title-affiliates">Affiliate Program</h1>
          <p className="text-muted-foreground">
            Earn 30% commission for every user who upgrades to a paid plan using your affiliate link!
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Signups</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-signups">{stats.totalSignups}</div>
              <p className="text-xs text-muted-foreground">
                Users who signed up
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-total-earnings">
                ${(stats.totalEarnings / 100).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                From successful conversions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Balance</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="text-pending-balance">
                ${(stats.pendingBalance / 100).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Available for payout
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid Out</CardTitle>
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-total-paid-out">
                ${(stats.totalPaidOut / 100).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Already received
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Affiliate Link Management */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Your Affiliate Link</CardTitle>
            <CardDescription>
              Share this link to earn 30% commission when users sign up and subscribe to a paid plan.
              New users get 500 bonus credits when they sign up with your link!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="affiliate-code">Affiliate Code</Label>
              <div className="flex gap-2 mt-1">
                {isEditingCode ? (
                  <>
                    <Input
                      id="affiliate-code"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="Enter custom code"
                      maxLength={20}
                      data-testid="input-edit-code"
                    />
                    <Button
                      size="icon"
                      onClick={handleSaveCode}
                      disabled={updateCodeMutation.isPending || !newCode.trim()}
                      data-testid="button-save-code"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={affiliateCode}
                      readOnly
                      className="flex-1"
                      data-testid="text-affiliate-code"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={handleEditCode}
                      data-testid="button-edit-code"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="affiliate-url">Affiliate URL</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="affiliate-url"
                  value={affiliateUrl}
                  readOnly
                  className="flex-1"
                  data-testid="text-affiliate-url"
                />
                <Button onClick={handleCopyAffiliateUrl} data-testid="button-copy-link">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payout Request */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Request Payout</CardTitle>
            <CardDescription>
              Request a payout when you have a minimum balance of $10.00
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showPayoutForm ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">
                  Current balance: <strong>${(stats.pendingBalance / 100).toFixed(2)}</strong>
                </p>
                <Button 
                  onClick={() => setShowPayoutForm(true)}
                  disabled={!canRequestPayout}
                  data-testid="button-request-payout"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Request Payout
                </Button>
                {!canRequestPayout && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Minimum payout amount is $10.00
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="paypal-email">PayPal Email Address</Label>
                  <Input
                    id="paypal-email"
                    type="email"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    placeholder="your@email.com"
                    data-testid="input-paypal-email"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleRequestPayout}
                    disabled={requestPayoutMutation.isPending || !paypalEmail.trim()}
                    data-testid="button-submit-payout"
                  >
                    {requestPayoutMutation.isPending ? "Requesting..." : "Submit Payout Request"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowPayoutForm(false)}
                    data-testid="button-cancel-payout"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity History */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Signups */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Signups</CardTitle>
              <CardDescription>
                Users who signed up with your affiliate link
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signups.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Signups Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Start sharing your affiliate link to earn credits and commissions!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {signups.slice(0, 5).map((signup) => (
                    <div
                      key={signup.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      data-testid={`card-signup-${signup.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1">
                            <Link 
                              href={`/u/${signup.username}`}
                              className="flex items-center gap-1 hover:underline"
                              data-testid={`link-user-${signup.signupUserId}`}
                            >
                              {signup.username}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Signed up {format(new Date(signup.createdAt), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">
                          +{signup.bonusCreditsAwarded} credits awarded
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Earnings */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Earnings</CardTitle>
              <CardDescription>
                30% commission from subscription payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {earnings.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Earnings Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Earn 30% commission when your referrals upgrade to paid plans!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {earnings.slice(0, 5).map((earning) => (
                    <div
                      key={earning.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`card-earning-${earning.id}`}
                    >
                      <div>
                        <p className="font-medium">{earning.planName} Plan</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(earning.createdAt), "MMM dd, yyyy")} • {earning.subscriptionPeriod}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">
                          +${(earning.commissionAmount / 100).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          30% of ${(earning.subscriptionAmount / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payout History */}
        {payouts.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Payout History</CardTitle>
              <CardDescription>
                Your requested payouts and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`card-payout-${payout.id}`}
                  >
                    <div>
                      <p className="font-medium">${(payout.requestedAmount / 100).toFixed(2)} to {payout.paypalEmail}</p>
                      <p className="text-sm text-muted-foreground">
                        Requested {format(new Date(payout.createdAt), "MMM dd, yyyy")}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        payout.status === 'completed' ? 'bg-green-100 text-green-800' :
                        payout.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {payout.status}
                      </span>
                      {payout.completedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Completed {format(new Date(payout.completedAt), "MMM dd")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  </div>
  );
}