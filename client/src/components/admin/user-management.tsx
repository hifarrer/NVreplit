import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, Edit, User, Calendar, Music, Video, Loader2, AlertTriangle, CreditCard, Mail, MailCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserWithStats {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
  projectCount: number;
  songCount: number;
  planName: string;
  planId: string;
  creditsUsed: number;
  creditsLimit: number;
}

interface Plan {
  id: string;
  name: string;
  credits: number;
  monthlyPrice: number;
  yearlyPrice: number;
}

export function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserWithStats | null>(null);
  const [editFormData, setEditFormData] = useState({ username: "", email: "" });
  const [changePlanUser, setChangePlanUser] = useState<UserWithStats | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  // Fetch users with auth header
  const { data: users, isLoading } = useQuery<UserWithStats[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  // Fetch available plans
  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/plans", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { username: string; email: string } }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({
        title: "Success",
        description: "User updated successfully",
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

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteConfirmUser(null);
      toast({
        title: "Success",
        description: "User deleted successfully",
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

  // Change plan mutation
  const changePlanMutation = useMutation({
    mutationFn: async ({ userId, planId }: { userId: string; planId: string }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error("Failed to change user plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setChangePlanUser(null);
      setSelectedPlanId("");
      toast({
        title: "Success",
        description: "User plan updated successfully",
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

  // Toggle email verification mutation
  const toggleEmailVerificationMutation = useMutation({
    mutationFn: async ({ userId, emailVerified }: { userId: string; emailVerified: boolean }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/email-verification`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emailVerified }),
      });
      if (!res.ok) throw new Error("Failed to update email verification status");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: variables.emailVerified ? "Email Verified" : "Email Unverified",
        description: variables.emailVerified 
          ? "User's email has been marked as verified." 
          : "User's email has been marked as unverified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update email verification status",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (user: UserWithStats) => {
    setEditingUser(user);
    setEditFormData({ username: user.username, email: user.email });
  };

  const handleUpdate = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      userId: editingUser.id,
      data: editFormData,
    });
  };

  const handleDelete = (user: UserWithStats) => {
    setDeleteConfirmUser(user);
  };

  const confirmDelete = () => {
    if (!deleteConfirmUser) return;
    deleteUserMutation.mutate(deleteConfirmUser.id);
  };

  const handleChangePlan = (user: UserWithStats) => {
    setChangePlanUser(user);
    setSelectedPlanId(user.planId);
  };

  const confirmChangePlan = () => {
    if (!changePlanUser || !selectedPlanId) return;
    changePlanMutation.mutate({
      userId: changePlanUser.id,
      planId: selectedPlanId,
    });
  };

  if (isLoading) {
    return (
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/30 border-purple-500/20">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <User className="h-5 w-5 mr-2" />
          User Management
        </CardTitle>
        <CardDescription className="text-gray-300">
          Manage users, view their statistics, and perform administrative actions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {users?.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-600/20"
              data-testid={`user-row-${user.id}`}
            >
              <div className="flex items-center space-x-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback className="bg-purple-600 text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-medium text-white">{user.username}</h3>
                    <Badge variant="outline" className="border-purple-500/30 text-purple-300">
                      {user.email}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={`${
                        user.emailVerified 
                          ? 'border-green-500/30 text-green-400 bg-green-500/10' 
                          : 'border-orange-500/30 text-orange-400 bg-orange-500/10'
                      }`}
                    >
                      {user.emailVerified ? (
                        <>
                          <MailCheck className="h-3 w-3 mr-1" />
                          Verified
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3 mr-1" />
                          Unverified
                        </>
                      )}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-400">
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center">
                      <Video className="h-3 w-3 mr-1" />
                      {user.projectCount} projects
                    </span>
                    <span className="flex items-center">
                      <Music className="h-3 w-3 mr-1" />
                      {user.songCount} songs
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-3 mt-1">
                    <Badge className="bg-purple-600/20 text-purple-300 border-purple-500/30">
                      {user.planName || "Free"}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {user.creditsUsed?.toLocaleString() || 0}/{user.creditsLimit?.toLocaleString() || 0} credits used
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleChangePlan(user)}
                  className="border-purple-600 text-purple-300 hover:bg-purple-700/20"
                  data-testid={`button-change-plan-${user.id}`}
                  title="Change Plan"
                >
                  <CreditCard className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toggleEmailVerificationMutation.mutate({
                      userId: user.id,
                      emailVerified: !user.emailVerified
                    });
                  }}
                  className={`${
                    user.emailVerified 
                      ? 'border-green-500/30 text-green-400 hover:bg-green-600/20' 
                      : 'border-orange-500/30 text-orange-400 hover:bg-orange-600/20'
                  }`}
                  disabled={toggleEmailVerificationMutation.isPending}
                  data-testid={`button-toggle-email-verification-${user.id}`}
                  title={user.emailVerified ? "Mark as Unverified" : "Mark as Verified"}
                >
                  {user.emailVerified ? <MailCheck className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(user)}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  data-testid={`button-edit-user-${user.id}`}
                  title="Edit User"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(user)}
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500"
                  data-testid={`button-delete-user-${user.id}`}
                  title="Delete User"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {!users?.length && (
            <div className="text-center py-8 text-gray-400">
              No users found
            </div>
          )}
        </div>
      </CardContent>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20">
          <DialogHeader>
            <DialogTitle className="text-white">Edit User</DialogTitle>
            <DialogDescription className="text-gray-300">
              Update user information
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">Username</Label>
              <Input
                value={editFormData.username}
                onChange={(e) => setEditFormData(prev => ({ ...prev, username: e.target.value }))}
                className="bg-gray-800/50 border-gray-600 text-white"
                data-testid="input-edit-username"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-white">Email</Label>
              <Input
                value={editFormData.email}
                onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                className="bg-gray-800/50 border-gray-600 text-white"
                data-testid="input-edit-email"
              />
            </div>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingUser(null)}
                className="border-gray-600 text-gray-300"
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateUserMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="button-save-user"
              >
                {updateUserMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent className="bg-gray-900 border-red-500/20">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-red-400" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              This action cannot be undone. All user data, projects, and songs will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          
          {deleteConfirmUser && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <AlertDescription className="text-red-400">
                Are you sure you want to delete user <strong>{deleteConfirmUser.username}</strong>?
                This will delete {deleteConfirmUser.projectCount} projects and {deleteConfirmUser.songCount} songs.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmUser(null)}
              className="border-gray-600 text-gray-300"
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete User"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={!!changePlanUser} onOpenChange={() => {
        setChangePlanUser(null);
        setSelectedPlanId("");
      }}>
        <DialogContent className="bg-gray-900 border-purple-500/20">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-purple-400" />
              Change User Plan
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              Select a new plan for {changePlanUser?.username}
            </DialogDescription>
          </DialogHeader>
          
          {changePlanUser && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Current Plan:</span>
                  <Badge className="bg-purple-600/20 text-purple-300">
                    {changePlanUser.planName || "Free"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Credits Used:</span>
                  <span className="text-sm text-white">
                    {changePlanUser.creditsUsed?.toLocaleString() || 0}/{changePlanUser.creditsLimit?.toLocaleString() || 0}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Select New Plan</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    {plans?.map((plan) => (
                      <SelectItem 
                        key={plan.id} 
                        value={plan.id}
                        className="text-white hover:bg-gray-700"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{plan.name}</span>
                          <span className="text-xs text-gray-400 ml-4">
                            {plan.credits.toLocaleString()} credits
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlanId && selectedPlanId !== changePlanUser.planId && (
                <Alert className="border-purple-500/50 bg-purple-500/10">
                  <AlertDescription className="text-purple-300">
                    Changing to {plans?.find(p => p.id === selectedPlanId)?.name} plan will update the user's credit limit to {plans?.find(p => p.id === selectedPlanId)?.credits.toLocaleString()} credits.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setChangePlanUser(null);
                setSelectedPlanId("");
              }}
              className="border-gray-600 text-gray-300"
              data-testid="button-cancel-change-plan"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmChangePlan}
              disabled={changePlanMutation.isPending || !selectedPlanId || selectedPlanId === changePlanUser?.planId}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-confirm-change-plan"
            >
              {changePlanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Plan"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}