import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Gift, Users, Share2, Edit2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface Referral {
  id: string;
  referredUserId: string;
  creditsAwarded: number;
  isRewarded: boolean;
  rewardedAt: string | null;
  planUpgradeAt: string | null;
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  totalCreditsEarned: number;
  pendingReferrals: number;
}

interface ReferralData {
  referrals: Referral[];
  stats: ReferralStats;
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [newCode, setNewCode] = useState("");

  // Fetch referral data
  const { data: referralData, isLoading: isLoadingReferrals } = useQuery<ReferralData>({
    queryKey: ["/api/referrals"],
  });

  // Fetch referral code
  const { data: codeData, isLoading: isLoadingCode } = useQuery<{ referralCode: string }>({
    queryKey: ["/api/referrals/code"],
  });

  // Update referral code mutation
  const updateCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest('POST', '/api/referrals/code', { code });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update referral code');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: "Your referral code has been updated.",
      });
      setIsEditingCode(false);
      setNewCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/code"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update referral code",
        variant: "destructive",
      });
    },
  });

  const handleCopyReferralUrl = () => {
    if (!codeData?.referralCode) return;
    
    const referralUrl = `${window.location.origin}/auth?ref=${codeData.referralCode}`;
    navigator.clipboard.writeText(referralUrl);
    toast({
      title: "Copied!",
      description: "Referral link copied to clipboard",
    });
  };

  const handleEditCode = () => {
    setNewCode(codeData?.referralCode || "");
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

  if (isLoadingReferrals || isLoadingCode) {
    return (
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
    );
  }

  const stats = referralData?.stats || { totalReferrals: 0, totalCreditsEarned: 0, pendingReferrals: 0 };
  const referrals = referralData?.referrals || [];
  const referralCode = codeData?.referralCode || "";
  const referralUrl = `${window.location.origin}/auth?ref=${referralCode}`;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="title-referrals">Referral Program</h1>
          <p className="text-muted-foreground">
            Earn 2500 credits for every user who upgrades to a paid plan using your referral link!
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-referrals">{stats.totalReferrals}</div>
              <p className="text-xs text-muted-foreground">
                Users you've referred
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credits Earned</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-credits-earned">{stats.totalCreditsEarned}</div>
              <p className="text-xs text-muted-foreground">
                From successful referrals
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="text-pending-referrals">{stats.pendingReferrals}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting plan upgrades
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Referral Link Management */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Your Referral Link</CardTitle>
            <CardDescription>
              Share this link to earn credits when new users sign up and upgrade to a paid plan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="referral-code">Referral Code</Label>
              <div className="flex gap-2 mt-1">
                {isEditingCode ? (
                  <>
                    <Input
                      id="referral-code"
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
                      value={referralCode}
                      readOnly
                      className="flex-1"
                      data-testid="text-referral-code"
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
              <Label htmlFor="referral-url">Referral URL</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="referral-url"
                  value={referralUrl}
                  readOnly
                  className="flex-1"
                  data-testid="text-referral-url"
                />
                <Button onClick={handleCopyReferralUrl} data-testid="button-copy-link">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referral History */}
        <Card>
          <CardHeader>
            <CardTitle>Referral History</CardTitle>
            <CardDescription>
              Track your referrals and see when you earn credits
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <div className="text-center py-8">
                <Share2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Referrals Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start sharing your referral link to earn credits!
                </p>
                <Button onClick={handleCopyReferralUrl} data-testid="button-start-referring">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Referral Link
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {referrals.map((referral) => (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`card-referral-${referral.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        referral.isRewarded ? 'bg-green-500' : 'bg-orange-500'
                      }`} />
                      <div>
                        <p className="font-medium">
                          Referral #{referral.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Joined {format(new Date(referral.createdAt), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {referral.isRewarded ? (
                        <div>
                          <p className="font-semibold text-green-600">
                            +{referral.creditsAwarded} credits
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Earned {referral.rewardedAt ? format(new Date(referral.rewardedAt), "MMM dd") : ""}
                          </p>
                        </div>
                      ) : referral.planUpgradeAt ? (
                        <div>
                          <p className="font-semibold text-orange-600">Pending</p>
                          <p className="text-sm text-muted-foreground">
                            Upgraded {format(new Date(referral.planUpgradeAt), "MMM dd")}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-semibold text-gray-600">Registered</p>
                          <p className="text-sm text-muted-foreground">
                            Awaiting upgrade
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}