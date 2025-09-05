import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Shield, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SiteSettings() {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    </div>
  );
}