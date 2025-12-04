import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Copy, Check, Mail, ExternalLink } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function GiftSuccessPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setRedemptionCode(code);
    }
  }, []);

  const handleCopyCode = () => {
    if (redemptionCode) {
      navigator.clipboard.writeText(redemptionCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Gift code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (redemptionCode) {
      const link = `${window.location.origin}/redeem-gift?code=${redemptionCode}`;
      navigator.clipboard.writeText(link);
      toast({
        title: "Copied!",
        description: "Redemption link copied to clipboard",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <NavigationHeader />
      
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-lg mx-auto text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <Gift className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Gift Purchase Complete!</h1>
            <p className="text-muted-foreground text-lg">
              Your gift has been sent to the recipient.
            </p>
          </div>

          <Card className="text-left">
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Email Sent</p>
                  <p className="text-sm text-muted-foreground">
                    The recipient will receive an email with instructions to redeem their gift.
                  </p>
                </div>
              </div>

              {redemptionCode && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Gift Code</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-4 py-3 rounded-lg font-mono text-lg text-center">
                        {redemptionCode}
                      </code>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={handleCopyCode}
                        data-testid="button-copy-code"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">
                      You can also share this direct link:
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleCopyLink}
                      data-testid="button-copy-link"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Copy Redemption Link
                    </Button>
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg p-4 text-sm">
                <p className="font-medium mb-1">Good to know:</p>
                <ul className="list-disc list-inside space-y-1 text-yellow-700 dark:text-yellow-300">
                  <li>The gift code is valid for 1 year</li>
                  <li>The recipient needs to create an account to redeem</li>
                  <li>You can view all your sent gifts in your profile</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={() => navigate("/gift")} variant="outline" data-testid="button-send-another">
              <Gift className="mr-2 h-4 w-4" />
              Send Another Gift
            </Button>
            <Button onClick={() => navigate("/profile")} data-testid="button-view-sent-gifts">
              View Sent Gifts
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
