import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, ArrowLeft, Save, Key, Home as HomeIcon, Music, Video, LogOut } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/neonlogo_1756693857051.png";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState(user?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  // Predefined avatar options
  const avatarOptions = [
    "/public-objects/avatars/avatar1.png",
    "/public-objects/avatars/avatar2.png", 
    "/public-objects/avatars/avatar3.png",
    "/public-objects/avatars/avatar4.png",
    "/public-objects/avatars/avatar5.png",
    "/public-objects/avatars/avatar6.png",
    "/public-objects/avatars/avatar7.png",
    "/public-objects/avatars/avatar8.png",
  ];

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string) => {
      const response = await apiRequest("PATCH", "/api/user/avatar", {
        avatarUrl
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Success",
        description: "Avatar updated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update avatar",
        variant: "destructive",
      });
    },
  });

  const handleAvatarSelect = (avatarUrl: string) => {
    updateAvatarMutation.mutate(avatarUrl);
  };

  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      const response = await apiRequest("PATCH", "/api/user/username", {
        username: newUsername
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Success",
        description: "Username updated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update username",
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (passwordData: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("PATCH", "/api/user/password", passwordData);
      return response.json();
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Success",
        description: "Password updated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive",
      });
    },
  });

  const handleUsernameUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }
    
    if (username === user?.username) {
      setError("New username must be different from current username");
      return;
    }
    
    updateUsernameMutation.mutate(username.trim());
  };

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long");
      return;
    }
    
    updatePasswordMutation.mutate({
      currentPassword,
      newPassword
    });
  };

  return (
    <div className="min-h-screen" data-testid="profile-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16" 
                data-testid="app-logo"
              />
              <nav className="flex items-center space-x-4">
                <Link href="/">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <HomeIcon className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </Link>
                <Link href="/my-songs">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Music className="h-4 w-4 mr-2" />
                    My Songs
                  </Button>
                </Link>
                <Link href="/my-videos">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Video className="h-4 w-4 mr-2" />
                    My Videos
                  </Button>
                </Link>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{user?.username}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
                data-testid="logout-button"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>
            </Link>
            <h1 className="text-3xl font-bold gradient-text mb-2">User Profile</h1>
            <p className="text-muted-foreground">
              Manage your account settings and preferences
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription data-testid="error-message">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {/* Avatar Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Avatar
                </CardTitle>
                <CardDescription>
                  Choose a profile picture from the available options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Current Avatar */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20">
                      {user?.avatarUrl ? (
                        <AvatarImage 
                          src={user.avatarUrl} 
                          alt={user.username}
                          data-testid="current-avatar-image"
                        />
                      ) : (
                        <AvatarFallback className="text-xl bg-gradient-to-br from-primary/20 to-secondary/20">
                          {user?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">Current Avatar</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.avatarUrl ? "Custom avatar selected" : "Default initial avatar"}
                      </p>
                    </div>
                  </div>

                  {/* Avatar Selection Grid */}
                  <div>
                    <Label className="text-sm font-medium">Choose New Avatar</Label>
                    <div className="grid grid-cols-4 gap-3 mt-2">
                      {avatarOptions.map((avatarUrl, index) => (
                        <button
                          key={index}
                          onClick={() => handleAvatarSelect(avatarUrl)}
                          disabled={updateAvatarMutation.isPending}
                          className={`relative h-16 w-16 rounded-full overflow-hidden border-2 transition-all hover:scale-105 ${
                            user?.avatarUrl === avatarUrl 
                              ? "border-primary ring-2 ring-primary/20" 
                              : "border-border hover:border-primary/50"
                          }`}
                          data-testid={`avatar-option-${index + 1}`}
                        >
                          <img
                            src={avatarUrl}
                            alt={`Avatar option ${index + 1}`}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              // Hide broken images
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          {user?.avatarUrl === avatarUrl && (
                            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                              <div className="h-2 w-2 bg-primary rounded-full" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Click on any avatar to select it as your profile picture
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Separator />
            {/* Username Update */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Update Username
                </CardTitle>
                <CardDescription>
                  Change your display name that appears throughout the application
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUsernameUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter new username"
                      data-testid="input-username"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={updateUsernameMutation.isPending}
                    data-testid="button-update-username"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateUsernameMutation.isPending ? "Updating..." : "Update Username"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Separator />

            {/* Password Reset */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Reset Password
                </CardTitle>
                <CardDescription>
                  Change your account password for security
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      data-testid="input-current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      data-testid="input-new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      data-testid="input-confirm-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={updatePasswordMutation.isPending}
                    data-testid="button-update-password"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}