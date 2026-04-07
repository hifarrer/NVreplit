import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Edit, User, Calendar, Music, Video, Loader2, AlertTriangle, CreditCard, Mail, MailCheck, Download, Plus, ChevronLeft, ChevronRight, Search, ChevronsRight, Ban, Check, Image, Wand2, Clock, Eye, X, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { convertAvatarUrlToImageKit } from "@/lib/utils";

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
  planCredits: number;
  bonusCredits: number;
  lastIpAddress: string | null;
  lastKnownLocation: string | null;
  lastUserAgent: string | null;
  lastDeviceType: string | null;
  lastBrowser: string | null;
  lastSeenAt: string | null;
}

interface BannedUser {
  id: string;
  email: string;
  reason: string | null;
  bannedBy: string;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  credits: number;
  monthlyPrice: number;
  yearlyPrice: number;
}

interface UserProject {
  id: string;
  title: string;
  description: string | null;
  currentStep: number;
  audioUrl: string | null;
  audioType: string | null;
  audioPrompt: string | null;
  audioDuration: number | null;
  characterImageUrl: string | null;
  characterType: string | null;
  characterPrompt: string | null;
  scenePrompts: string[] | null;
  sceneImages: string[] | null;
  videoSegments: string[] | null;
  finalVideoUrl: string | null;
  muxPlaybackId: string | null;
  muxAssetStatus: string | null;
  isCompleted: boolean;
  generationStatus: string | null;
  aspectRatio: string | null;
  videoQuality: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserProjectsResponse {
  user: {
    id: string;
    username: string;
    email: string;
  };
  projects: UserProject[];
}

interface UsersResponse {
  users: UserWithStats[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserWithStats | null>(null);
  const [editFormData, setEditFormData] = useState({ username: "", email: "" });
  const [changePlanUser, setChangePlanUser] = useState<UserWithStats | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [bonusCreditsUser, setBonusCreditsUser] = useState<UserWithStats | null>(null);
  const [bonusCreditsAmount, setBonusCreditsAmount] = useState<number>(0);
  const [creditsUsedAmount, setCreditsUsedAmount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const [viewingProjectsUser, setViewingProjectsUser] = useState<UserWithStats | null>(null);
  const [selectedProject, setSelectedProject] = useState<UserProject | null>(null);

  // Debounce search query - only update after user stops typing for 500ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch users with auth header, pagination, and search
  const { data: usersResponse, isLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", currentPage, pageSize, planFilter, debouncedSearchQuery],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      if (planFilter !== "all") {
        params.append("plan", planFilter);
      }
      if (debouncedSearchQuery.trim()) {
        params.append("search", debouncedSearchQuery.trim());
      }
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const allUsers = usersResponse?.users || [];
  const pagination = usersResponse?.pagination;

  // Filter users based on banned status if "banned" filter is selected
  const users = planFilter === "banned" 
    ? allUsers.filter(user => isUserBanned(user.email))
    : allUsers;

  // Handle plan filter change - reset to page 1
  const handlePlanFilterChange = (value: string) => {
    setPlanFilter(value);
    setCurrentPage(1);
  };

  // Handle search - reset to page 1
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

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

  // Fetch user projects when viewing
  const { data: userProjectsData, isLoading: isLoadingProjects } = useQuery<UserProjectsResponse | undefined>({
    queryKey: ["/api/admin/users", viewingProjectsUser?.id, "projects"],
    queryFn: async () => {
      if (!viewingProjectsUser) return undefined;
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${viewingProjectsUser.id}/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch user projects");
      return res.json();
    },
    enabled: !!viewingProjectsUser,
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

  // Bonus credits mutation
  const bonusCreditsMutation = useMutation({
    mutationFn: async ({ userId, bonusCredits }: { userId: string; bonusCredits: number }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/bonus-credits`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bonusCredits }),
      });
      if (!res.ok) throw new Error("Failed to update bonus credits");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBonusCreditsUser(null);
      setBonusCreditsAmount(0);
      toast({
        title: "Bonus Credits Updated",
        description: `Successfully updated bonus credits to ${variables.bonusCredits}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update bonus credits",
        variant: "destructive",
      });
    },
  });

  // Credits used mutation
  const creditsUsedMutation = useMutation({
    mutationFn: async ({ userId, creditsUsed }: { userId: string; creditsUsed: number }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/credits-used`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ creditsUsed }),
      });
      if (!res.ok) throw new Error("Failed to update credits used");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBonusCreditsUser(null);
      setCreditsUsedAmount(0);
      toast({
        title: "Credits Used Updated",
        description: `Successfully updated credits used to ${variables.creditsUsed}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update credits used",
        variant: "destructive",
      });
    },
  });

  // Fetch banned users
  const { data: bannedUsers = [] } = useQuery<BannedUser[]>({
    queryKey: ["/api/admin/banned-users"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/banned-users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch banned users");
      return res.json();
    },
  });

  // Ban user mutation
  const banUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to ban user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banned-users"] });
      toast({
        title: "User Banned",
        description: "User has been banned successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to ban user",
        variant: "destructive",
      });
    },
  });

  // Unban user mutation
  const unbanUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/unban`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to unban user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banned-users"] });
      toast({
        title: "User Unbanned",
        description: "User has been unbanned successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to unban user",
        variant: "destructive",
      });
    },
  });

  // Helper function to check if a user is banned
  const isUserBanned = (email: string) => {
    return bannedUsers.some((bannedUser) => bannedUser.email.toLowerCase() === email.toLowerCase());
  };

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

  const handleBonusCredits = (user: UserWithStats) => {
    setBonusCreditsUser(user);
    setBonusCreditsAmount(0);
    setCreditsUsedAmount(user.creditsUsed || 0);
  };

  const confirmBonusCredits = () => {
    if (!bonusCreditsUser) return;
    bonusCreditsMutation.mutate({
      userId: bonusCreditsUser.id,
      bonusCredits: bonusCreditsAmount,
    });
  };

  const confirmCreditsUsed = () => {
    if (!bonusCreditsUser) return;
    creditsUsedMutation.mutate({
      userId: bonusCreditsUser.id,
      creditsUsed: creditsUsedAmount,
    });
  };

  // CSV export function
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch("/api/admin/users/export", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to export users");
      }

      // Get the CSV content
      const csvData = await response.text();

      // Create a blob and download
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "User list exported successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to export users",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center">
              <User className="h-5 w-5 mr-2" />
              User Management
            </CardTitle>
            <CardDescription className="text-gray-300">
              Manage users, view their statistics, and perform administrative actions
            </CardDescription>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by email or username..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 w-64 bg-gray-800/50 border-gray-600 text-white placeholder:text-gray-400"
                data-testid="input-search-users"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Label className="text-sm text-gray-300">Filter by Plan:</Label>
              <Select value={planFilter} onValueChange={handlePlanFilterChange}>
                <SelectTrigger className="w-36 bg-gray-800/50 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="all" className="text-white hover:bg-gray-700">
                    All Plans
                  </SelectItem>
                  <SelectItem value="Free" className="text-white hover:bg-gray-700">
                    Free
                  </SelectItem>
                  <SelectItem value="Basic" className="text-white hover:bg-gray-700">
                    Basic
                  </SelectItem>
                  <SelectItem value="Premium" className="text-white hover:bg-gray-700">
                    Premium
                  </SelectItem>
                  <SelectItem value="banned" className="text-red-400 hover:bg-gray-700">
                    Banned Users
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleExportCSV}
              disabled={isExporting || !users?.length}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-export-users"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </>
              )}
            </Button>
          </div>
        </div>
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
                  <AvatarImage src={user.avatarUrl ? convertAvatarUrlToImageKit(user.avatarUrl) || user.avatarUrl : undefined} />
                  <AvatarFallback className="bg-purple-600 text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <a
                      href={`/u/${user.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-purple-400 hover:text-purple-300 hover:underline"
                      data-testid={`user-link-${user.username}`}
                    >
                      {user.username}
                    </a>
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
                    {isUserBanned(user.email) && (
                      <Badge 
                        variant="outline" 
                        className="border-red-500/30 text-red-400 bg-red-500/10"
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        BANNED
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-400">
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => setViewingProjectsUser(user)}
                      className="flex items-center hover:text-purple-400 transition-colors cursor-pointer underline underline-offset-2"
                      title="Click to view projects"
                    >
                      <Video className="h-3 w-3 mr-1" />
                      {user.projectCount} projects
                    </button>
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

                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>IP: {user.lastIpAddress || "Unknown"}</span>
                    <span className="flex items-center">
                      <MapPin className="h-3 w-3 mr-1" />
                      {user.lastKnownLocation || "Unknown location"}
                    </span>
                    <span>
                      Device: {user.lastDeviceType || "Unknown"}
                    </span>
                    <span>
                      Browser: {user.lastBrowser || "Unknown"}
                    </span>
                    <span>
                      Last seen: {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : "Unknown"}
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
                  onClick={() => handleBonusCredits(user)}
                  className="border-yellow-600 text-yellow-300 hover:bg-yellow-700/20"
                  data-testid={`button-bonus-credits-${user.id}`}
                  title="Give Bonus Credits"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {isUserBanned(user.email) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unbanUserMutation.mutate(user.id)}
                    className="border-green-500/30 text-green-400 hover:bg-green-600/20"
                    disabled={unbanUserMutation.isPending}
                    data-testid={`button-unban-user-${user.id}`}
                    title="Unban User"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => banUserMutation.mutate({ userId: user.id })}
                    className="border-red-500/30 text-red-400 hover:bg-red-600/20"
                    disabled={banUserMutation.isPending}
                    data-testid={`button-ban-user-${user.id}`}
                    title="Ban User"
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
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

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-600/20">
            <div className="text-sm text-gray-400">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} users
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(pagination.page - 1)}
                disabled={!pagination.hasPrev}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <span className="text-sm text-gray-300 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(pagination.page + 1)}
                disabled={!pagination.hasNext}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(pagination.totalPages)}
                disabled={!pagination.hasNext}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-last-page"
              >
                Last
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
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

      {/* Credits Management Dialog */}
      <Dialog open={!!bonusCreditsUser} onOpenChange={() => setBonusCreditsUser(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Manage Credits</DialogTitle>
            <DialogDescription className="text-gray-300">
              Manage credits for {bonusCreditsUser?.username}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {bonusCreditsUser && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Current Credits Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-300">
                    <span>Plan Credits:</span>
                    <span>{bonusCreditsUser.planCredits?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Current Bonus Credits:</span>
                    <span>{bonusCreditsUser.bonusCredits?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Credits Used:</span>
                    <span>{bonusCreditsUser.creditsUsed?.toLocaleString() || 0}</span>
                  </div>
                  <hr className="border-purple-500/30 my-2" />
                  <div className="flex justify-between text-green-300 font-medium">
                    <span>Available Credits:</span>
                    <span>{((bonusCreditsUser.planCredits || 0) + (bonusCreditsUser.bonusCredits || 0) - (bonusCreditsUser.creditsUsed || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Credits Used Section */}
            <div className="space-y-3 p-4 border border-blue-500/30 rounded-lg bg-blue-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white font-medium">Credits Used</Label>
                  <p className="text-gray-400 text-xs mt-1">Set to 0 to reset user's credits for a new billing period</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="10000000"
                  step="1"
                  value={creditsUsedAmount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setCreditsUsedAmount(Math.max(0, Math.min(10000000, value)));
                  }}
                  className="bg-gray-800 border-blue-500/30 text-white flex-1"
                  placeholder="Enter credits used"
                  data-testid="input-credits-used-amount"
                />
                <Button
                  onClick={confirmCreditsUsed}
                  disabled={
                    creditsUsedMutation.isPending || 
                    creditsUsedAmount < 0 || 
                    creditsUsedAmount > 10000000 ||
                    !Number.isInteger(creditsUsedAmount) ||
                    !Number.isFinite(creditsUsedAmount)
                  }
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  data-testid="button-update-credits-used"
                >
                  {creditsUsedMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update"
                  )}
                </Button>
              </div>
            </div>

            {/* Bonus Credits Section */}
            <div className="space-y-3 p-4 border border-yellow-500/30 rounded-lg bg-yellow-500/5">
              <div>
                <Label className="text-white font-medium">Add Bonus Credits</Label>
                <p className="text-gray-400 text-xs mt-1">Award extra credits on top of plan credits</p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={bonusCreditsAmount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setBonusCreditsAmount(Math.max(0, Math.min(1000000, value)));
                  }}
                  className="bg-gray-800 border-yellow-500/30 text-white flex-1"
                  placeholder="Enter new bonus credits total"
                  data-testid="input-bonus-credits-amount"
                />
                <Button
                  onClick={confirmBonusCredits}
                  disabled={
                    bonusCreditsMutation.isPending || 
                    bonusCreditsAmount < 0 || 
                    bonusCreditsAmount > 1000000 ||
                    !Number.isInteger(bonusCreditsAmount) ||
                    !Number.isFinite(bonusCreditsAmount)
                  }
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50"
                  data-testid="button-confirm-bonus-credits"
                >
                  {bonusCreditsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update"
                  )}
                </Button>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setBonusCreditsUser(null);
                setBonusCreditsAmount(0);
                setCreditsUsedAmount(0);
              }}
              className="border-gray-600 text-gray-300"
              data-testid="button-close-credits-dialog"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Projects Dialog */}
      <Dialog open={!!viewingProjectsUser} onOpenChange={() => { setViewingProjectsUser(null); setSelectedProject(null); }}>
        <DialogContent className="bg-gray-900 border-purple-500/20 max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center">
              <Video className="h-5 w-5 mr-2" />
              Projects for {viewingProjectsUser?.username}
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              {viewingProjectsUser?.email} - {userProjectsData?.projects?.length || 0} projects
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[60vh] pr-4">
            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              </div>
            ) : userProjectsData?.projects?.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No projects found for this user.
              </div>
            ) : (
              <div className="space-y-3">
                {userProjectsData?.projects?.map((project) => {
                  const getStepName = (step: number) => {
                    const steps = ['Audio', 'Character', 'Scenes', 'Video', 'Result'];
                    return steps[step - 1] || 'Unknown';
                  };
                  
                  const getStatusColor = (project: UserProject) => {
                    if (project.isCompleted && project.finalVideoUrl) return 'text-green-400 bg-green-500/10 border-green-500/30';
                    if (project.generationStatus === 'generating') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
                    if (project.generationStatus === 'failed') return 'text-red-400 bg-red-500/10 border-red-500/30';
                    return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
                  };
                  
                  const getStatusText = (project: UserProject) => {
                    if (project.isCompleted && project.finalVideoUrl) return 'Completed';
                    if (project.generationStatus === 'generating') return 'Generating';
                    if (project.generationStatus === 'failed') return 'Failed';
                    if (project.currentStep === 1 && !project.audioUrl) return 'Just Started';
                    return `Step ${project.currentStep}: ${getStepName(project.currentStep)}`;
                  };
                  
                  const hasSceneImages = project.sceneImages && Array.isArray(project.sceneImages) && project.sceneImages.length > 0;
                  const hasCharacterImage = !!project.characterImageUrl;
                  
                  return (
                    <div 
                      key={project.id}
                      className="p-4 bg-gray-800/50 rounded-lg border border-gray-600/30 hover:border-purple-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-white font-medium">{project.title || 'Untitled Project'}</h4>
                            <Badge className={getStatusColor(project)}>
                              {getStatusText(project)}
                            </Badge>
                          </div>
                          
                          <div className="flex flex-wrap gap-4 text-xs text-gray-400 mb-3">
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {new Date(project.createdAt).toLocaleString()}
                            </span>
                            {project.aspectRatio && (
                              <span>Aspect: {project.aspectRatio}</span>
                            )}
                            {project.videoQuality && (
                              <span>Quality: {project.videoQuality}</span>
                            )}
                            {project.audioDuration && (
                              <span>Duration: {Math.floor(project.audioDuration / 60)}:{(project.audioDuration % 60).toString().padStart(2, '0')}</span>
                            )}
                          </div>
                          
                          {/* Progress Summary */}
                          <div className="grid grid-cols-5 gap-2 mb-3">
                            <div className={`text-center p-2 rounded text-xs ${project.audioUrl ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-500'}`}>
                              Audio {project.audioUrl ? '✓' : '○'}
                            </div>
                            <div className={`text-center p-2 rounded text-xs ${hasCharacterImage ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-500'}`}>
                              Character {hasCharacterImage ? '✓' : '○'}
                            </div>
                            <div className={`text-center p-2 rounded text-xs ${hasSceneImages ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-500'}`}>
                              Scenes {hasSceneImages ? '✓' : '○'}
                            </div>
                            <div className={`text-center p-2 rounded text-xs ${project.videoSegments && (project.videoSegments as string[]).length > 0 ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-500'}`}>
                              Videos {project.videoSegments && (project.videoSegments as string[]).length > 0 ? '✓' : '○'}
                            </div>
                            <div className={`text-center p-2 rounded text-xs ${project.finalVideoUrl ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-500'}`}>
                              Final {project.finalVideoUrl ? '✓' : '○'}
                            </div>
                          </div>
                          
                          {/* Prompts/Details */}
                          {project.audioPrompt && (
                            <div className="text-xs text-gray-400 mb-2">
                              <span className="text-gray-500">Audio Prompt:</span> {project.audioPrompt.substring(0, 100)}{project.audioPrompt.length > 100 ? '...' : ''}
                            </div>
                          )}
                          {project.characterPrompt && (
                            <div className="text-xs text-gray-400 mb-2">
                              <span className="text-gray-500">Character:</span> {project.characterPrompt.substring(0, 100)}{project.characterPrompt.length > 100 ? '...' : ''}
                            </div>
                          )}
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex flex-col gap-2 ml-4">
                          {(hasCharacterImage || hasSceneImages) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedProject(project)}
                              className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Images
                            </Button>
                          )}
                          {project.finalVideoUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(project.finalVideoUrl!, '_blank', 'noopener,noreferrer')}
                              className="border-green-500/30 text-green-300 hover:bg-green-600/20"
                            >
                              <Video className="h-4 w-4 mr-1" />
                              Video
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Project Images/Scenes Viewer Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center">
              <Image className="h-5 w-5 mr-2" />
              {selectedProject?.title || 'Project'} - Generated Images
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[70vh] pr-4">
            {selectedProject && (
              <div className="space-y-6">
                {/* Character Image */}
                {selectedProject.characterImageUrl && (
                  <div>
                    <h3 className="text-lg text-white font-medium mb-3 flex items-center">
                      <Wand2 className="h-4 w-4 mr-2 text-purple-400" />
                      Character Image
                    </h3>
                    {selectedProject.characterPrompt && (
                      <p className="text-sm text-gray-400 mb-3">Prompt: {selectedProject.characterPrompt}</p>
                    )}
                    <div className="bg-gray-800/50 p-4 rounded-lg inline-block">
                      <img 
                        src={selectedProject.characterImageUrl} 
                        alt="Character" 
                        className="max-w-md max-h-80 object-contain rounded-lg"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Scene Images */}
                {selectedProject.sceneImages && Array.isArray(selectedProject.sceneImages) && selectedProject.sceneImages.length > 0 && (
                  <div>
                    <h3 className="text-lg text-white font-medium mb-3 flex items-center">
                      <Image className="h-4 w-4 mr-2 text-blue-400" />
                      Scene Images ({selectedProject.sceneImages.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {(selectedProject.sceneImages as string[]).map((imageUrl, index) => (
                        <div key={index} className="bg-gray-800/50 p-3 rounded-lg">
                          <div className="text-xs text-gray-400 mb-2">Scene {index + 1}</div>
                          <img 
                            src={imageUrl} 
                            alt={`Scene ${index + 1}`}
                            className="w-full h-40 object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          {selectedProject.scenePrompts && 
                           Array.isArray(selectedProject.scenePrompts) && 
                           selectedProject.scenePrompts[index] && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                              {selectedProject.scenePrompts[index]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Scene Prompts without images */}
                {selectedProject.scenePrompts && 
                 Array.isArray(selectedProject.scenePrompts) && 
                 selectedProject.scenePrompts.length > 0 && 
                 (!selectedProject.sceneImages || (selectedProject.sceneImages as string[]).length === 0) && (
                  <div>
                    <h3 className="text-lg text-white font-medium mb-3">Scene Prompts (Images not generated)</h3>
                    <div className="space-y-2">
                      {(selectedProject.scenePrompts as string[]).map((prompt, index) => (
                        <div key={index} className="bg-gray-800/50 p-3 rounded-lg">
                          <span className="text-purple-400 font-medium">Scene {index + 1}:</span>
                          <span className="text-gray-300 ml-2">{prompt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {!selectedProject.characterImageUrl && 
                 (!selectedProject.sceneImages || (selectedProject.sceneImages as string[]).length === 0) && (
                  <div className="text-center py-12 text-gray-400">
                    No images have been generated for this project yet.
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}