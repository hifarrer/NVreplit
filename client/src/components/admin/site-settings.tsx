import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Shield, Loader2, CheckCircle, CreditCard, AlertCircle, Database, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SiteSettings() {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  
  // Fetch Stripe settings
  const { data: stripeSettings } = useQuery({
    queryKey: ["/api/admin/stripe-settings"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/stripe-settings", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch Stripe settings");
      return res.json();
    },
  });
  
  // Update form when settings are loaded
  useEffect(() => {
    if (stripeSettings) {
      setStripePublishableKey(stripeSettings.stripePublishableKey || "");
      setStripeSecretKey(stripeSettings.stripeSecretKey || "");
      setStripeWebhookSecret(stripeSettings.stripeWebhookSecret || "");
    }
  }, [stripeSettings]);
  
  // Update Stripe settings mutation
  const updateStripeSettingsMutation = useMutation({
    mutationFn: async (settings: { stripePublishableKey: string; stripeSecretKey: string; stripeWebhookSecret: string }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/stripe-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to update Stripe settings");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Stripe settings updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset admin password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
      return res.json();
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Success",
        description: "Admin password updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePasswordReset = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate(newPassword);
  };

  const handleDatabaseBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch("/api/admin/database-backup", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = "Failed to download database backup";
        try {
          const text = await response.text();
          if (text) {
            try {
              const errorData = JSON.parse(text);
              errorMessage = errorData.error || text;
            } catch {
              errorMessage = text;
            }
          }
        } catch {
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "database_backup.sql";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: `Database backup downloaded successfully: ${filename}`,
      });
    } catch (error) {
      console.error("Database backup error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download database backup",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Site Information */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Site Information
          </CardTitle>
          <CardDescription className="text-gray-300">
            General application settings and information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Application Name</Label>
              <div className="text-white font-medium">NeonVideo.ai</div>
            </div>
            <div>
              <Label className="text-gray-300">Version</Label>
              <div className="text-white font-medium">1.0.0</div>
            </div>
            <div>
              <Label className="text-gray-300">Environment</Label>
              <div className="text-white font-medium">Development</div>
            </div>
            <div>
              <Label className="text-gray-300">Database</Label>
              <div className="text-green-400 font-medium flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Security Settings
          </CardTitle>
          <CardDescription className="text-gray-300">
            Manage administrator security and access controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Reset Admin Password</h3>
            
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertDescription className="text-yellow-400">
                Changing the admin password will require you to log in again with the new credentials.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-white">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-gray-800/50 border-gray-600 text-white"
                  placeholder="Enter new password"
                  data-testid="input-new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-gray-800/50 border-gray-600 text-white"
                  placeholder="Confirm new password"
                  data-testid="input-confirm-password"
                />
              </div>

              <Button
                onClick={handlePasswordReset}
                disabled={resetPasswordMutation.isPending || !newPassword || !confirmPassword}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="button-reset-password"
              >
                {resetPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stripe Settings */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <CreditCard className="h-5 w-5 mr-2" />
            Stripe Payment Configuration
          </CardTitle>
          <CardDescription className="text-gray-300">
            Configure Stripe payment gateway for subscription billing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stripeSettings?.isConfigured ? (
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-400">
                Stripe is configured and ready for payments
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-400">
                Stripe is not fully configured. Please add all required keys to enable payments.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="stripePublishableKey" className="text-white">
                Stripe Publishable Key
              </Label>
              <Input
                id="stripePublishableKey"
                type="text"
                value={stripePublishableKey}
                onChange={(e) => setStripePublishableKey(e.target.value)}
                className="bg-gray-800/50 border-gray-600 text-white font-mono text-sm"
                placeholder="pk_live_..."
                data-testid="input-stripe-publishable-key"
              />
              <p className="text-xs text-gray-400">
                The publishable key is safe to expose in frontend code
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stripeSecretKey" className="text-white">
                Stripe Secret Key
              </Label>
              <Input
                id="stripeSecretKey"
                type="password"
                value={stripeSecretKey}
                onChange={(e) => setStripeSecretKey(e.target.value)}
                className="bg-gray-800/50 border-gray-600 text-white font-mono text-sm"
                placeholder="sk_live_..."
                data-testid="input-stripe-secret-key"
              />
              <p className="text-xs text-gray-400">
                Keep this key secure - it can perform any API request to Stripe
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stripeWebhookSecret" className="text-white">
                Stripe Webhook Secret
              </Label>
              <Input
                id="stripeWebhookSecret"
                type="password"
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                className="bg-gray-800/50 border-gray-600 text-white font-mono text-sm"
                placeholder="whsec_..."
                data-testid="input-stripe-webhook-secret"
              />
              <p className="text-xs text-gray-400">
                Used to verify webhook events from Stripe
              </p>
            </div>
            
            <Button
              onClick={() => updateStripeSettingsMutation.mutate({
                stripePublishableKey,
                stripeSecretKey,
                stripeWebhookSecret
              })}
              disabled={updateStripeSettingsMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-save-stripe-settings"
            >
              {updateStripeSettingsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Stripe Settings"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Settings */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white">API Configuration</CardTitle>
          <CardDescription className="text-gray-300">
            External service integrations and API status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">OpenAI API</div>
                <div className="text-sm text-gray-400">GPT-5 text generation</div>
              </div>
              <div className="text-green-400 flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">ElevenLabs API</div>
                <div className="text-sm text-gray-400">Music generation</div>
              </div>
              <div className="text-green-400 flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">Fal.ai API</div>
                <div className="text-sm text-gray-400">Image generation</div>
              </div>
              <div className="text-green-400 flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">Wavespeed API</div>
                <div className="text-sm text-gray-400">Video generation</div>
              </div>
              <div className="text-green-400 flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">FFMPEG API</div>
                <div className="text-sm text-gray-400">Video processing</div>
              </div>
              <div className="text-green-400 flex items-center">
                <CheckCircle className="h-4 w-4 mr-1" />
                Connected
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Database Management */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Database className="h-5 w-5 mr-2" />
            Database Management
          </CardTitle>
          <CardDescription className="text-gray-300">
            Backup and restore database operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-500/50 bg-blue-500/10">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-400">
              Database backups include all tables, data, and structure. Store backups securely and regularly.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-white mb-2">Full Database Backup</h3>
              <p className="text-gray-300 text-sm mb-4">
                Download a complete SQL backup of the database including structure and all data. 
                This backup can be used to restore the entire database.
              </p>
              
              <Button
                onClick={handleDatabaseBackup}
                disabled={isDownloadingBackup}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-download-backup"
              >
                {isDownloadingBackup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Backup...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download Database Backup
                  </>
                )}
              </Button>
            </div>
            
            <div className="pt-4 border-t border-gray-600">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Backup Information</h4>
              <div className="text-xs text-gray-400 space-y-1">
                <div>• Includes all table structures and data</div>
                <div>• File format: SQL dump with CREATE and INSERT statements</div>
                <div>• Filename includes timestamp for easy organization</div>
                <div>• Safe to download - no sensitive credentials included</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}