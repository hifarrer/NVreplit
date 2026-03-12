import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Activity, Settings, LogOut, Shield, Music, Video, CreditCard, MessageCircle, Play, DollarSign, Cpu, ImageIcon, Mic2, Film, Ticket, Zap } from "lucide-react";
import { UserManagement } from "../components/admin/user-management";
import { SiteSettings } from "../components/admin/site-settings";
import { UsageStatistics } from "../components/admin/usage-statistics";
import { VideoManagement } from "../components/admin/video-management";
import { AudioManagement } from "../components/admin/audio-management";
import { CommentManagement } from "../components/admin/comment-management";
import { MuxManagement } from "../components/admin/mux-management";
import { CouponManagement } from "../components/admin/coupon-management";
import { CharacterManagement } from "../components/admin/character-management";

interface AdminUser {
  username: string;
}

interface StatsOverview {
  totalUsers: number;
  monthlyRevenue: number;
  totalSongs: number;
  completedProjects: number;
}

function PostToSocialsButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cron/auto-post-to-social", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(data.message ?? "Request sent successfully.");
      } else {
        setMessage(data.error ?? data.message ?? `Error: ${res.status}`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 text-white"
      >
        {loading ? "Posting…" : "Post to socials"}
      </Button>
      {message && (
        <span className="text-sm text-gray-400">{message}</span>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  // Check admin authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    const user = localStorage.getItem("adminUser");

    if (!token || !user) {
      setLocation("/admin");
      return;
    }

    try {
      setAdminUser(JSON.parse(user));
    } catch {
      setLocation("/admin");
    }
  }, [setLocation]);

  // Fetch admin stats with auth header
  const { data: stats, isLoading } = useQuery<{ overview: StatsOverview }>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!adminUser,
  });

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    setLocation("/admin");
  };

  if (!adminUser) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-purple-500/20">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8 text-purple-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-sm text-gray-300">NeonVideo.ai Management</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-purple-600 text-white">
                  {adminUser.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-white text-sm">{adminUser.username}</span>
              <Badge variant="secondary" className="bg-purple-600/20 text-purple-300 border-purple-500/30">
                Admin
              </Badge>
            </div>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-white hover:bg-white/10"
              data-testid="button-admin-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Overview Cards */}
        {stats?.overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-black/30 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Total Users</CardTitle>
                <Users className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{stats.overview.totalUsers}</div>
              </CardContent>
            </Card>

            <Card className="bg-black/30 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Monthly Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  ${stats.overview.monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/30 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Total Songs</CardTitle>
                <Music className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{stats.overview.totalSongs}</div>
              </CardContent>
            </Card>

            <Card className="bg-black/30 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Completed Projects</CardTitle>
                <Activity className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{stats.overview.completedProjects}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Models Information */}
        <Card className="bg-black/30 border-purple-500/20 mb-8">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="h-5 w-5 text-purple-400" />
              Current AI Models
            </CardTitle>
            <CardDescription className="text-gray-400">
              Models currently in use for generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-black/20 rounded-lg p-4 border border-purple-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-gray-300">Character Image</span>
                </div>
                <p className="text-white font-mono text-sm">bytedance/seedream-v4</p>
                <p className="text-xs text-gray-500 mt-1">via Wavespeed.ai</p>
              </div>

              <div className="bg-black/20 rounded-lg p-4 border border-purple-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-medium text-gray-300">Scene Image</span>
                </div>
                <p className="text-white font-mono text-sm">google/nano-banana</p>
                <p className="text-xs text-gray-500 mt-1">Fallback: alibaba/wan-2.5</p>
              </div>

              <div className="bg-black/20 rounded-lg p-4 border border-purple-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <Mic2 className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-medium text-gray-300">Song Generation</span>
                </div>
                <p className="text-white font-mono text-sm">ElevenLabs</p>
                <p className="text-xs text-gray-500 mt-1">Music generation API</p>
              </div>

              <div className="bg-black/20 rounded-lg p-4 border border-purple-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <Film className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-medium text-gray-300">Video Generation</span>
                </div>
                <p className="text-white font-mono text-sm">seedance-v1.5-pro</p>
                <p className="text-xs text-gray-500 mt-1">Lipsync: wavespeed-ai/infinitetalk-fast</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-11 bg-black/30 border border-purple-500/20">
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-600">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="characters" className="data-[state=active]:bg-purple-600">
              <ImageIcon className="h-4 w-4 mr-2" />
              Characters
            </TabsTrigger>
            <TabsTrigger value="videos" className="data-[state=active]:bg-purple-600">
              <Video className="h-4 w-4 mr-2" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="audios" className="data-[state=active]:bg-purple-600">
              <Music className="h-4 w-4 mr-2" />
              Audios
            </TabsTrigger>
            <TabsTrigger value="comments" className="data-[state=active]:bg-purple-600">
              <MessageCircle className="h-4 w-4 mr-2" />
              Comments
            </TabsTrigger>
            <TabsTrigger value="mux" className="data-[state=active]:bg-purple-600">
              <Play className="h-4 w-4 mr-2" />
              Streaming
            </TabsTrigger>
            <TabsTrigger value="coupons" className="data-[state=active]:bg-purple-600">
              <Ticket className="h-4 w-4 mr-2" />
              Coupons
            </TabsTrigger>
            <TabsTrigger value="plans" className="data-[state=active]:bg-purple-600">
              <CreditCard className="h-4 w-4 mr-2" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="automation" className="data-[state=active]:bg-purple-600">
              <Zap className="h-4 w-4 mr-2" />
              Automation
            </TabsTrigger>
            <TabsTrigger value="statistics" className="data-[state=active]:bg-purple-600">
              <Activity className="h-4 w-4 mr-2" />
              Statistics
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-purple-600">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <UserManagement />
          </TabsContent>

          <TabsContent value="characters" className="space-y-6">
            <CharacterManagement />
          </TabsContent>

          <TabsContent value="videos" className="space-y-6">
            <VideoManagement />
          </TabsContent>

          <TabsContent value="audios" className="space-y-6">
            <AudioManagement />
          </TabsContent>

          <TabsContent value="comments" className="space-y-6">
            <CommentManagement />
          </TabsContent>

          <TabsContent value="mux" className="space-y-6">
            <MuxManagement />
          </TabsContent>

          <TabsContent value="coupons" className="space-y-6">
            <CouponManagement />
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <Card className="bg-black/30 border-purple-500/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-400" />
                  Manual automation triggers
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Trigger the same cron endpoints manually. Each button opens the API URL in a new tab.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Button
                  asChild
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <a
                    href="https://neonvideo.ai/api/auto-generate-loop-video?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjZDU2ZDkyYy1hNTZmLTQ2MmEtYWNhZi1iMDcyYWViMjRiNzIiLCJ1c2VybmFtZSI6ImN5Ym9yZzMzIiwiaWF0IjoxNzY5MTQ1NjczLCJleHAiOjIwODQ3MjE2NzN9.g-EWXfkesnZx5urr17c5VJS2iFHRVdEQoO0ngX51vUw"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Generate Video Loop
                  </a>
                </Button>
                <Button
                  asChild
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <a
                    href="https://www.neonvideo.ai/api/auto-generate-video?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjZDU2ZDkyYy1hNTZmLTQ2MmEtYWNhZi1iMDcyYWViMjRiNzIiLCJ1c2VybmFtZSI6ImN5Ym9yZzMzIiwiaWF0IjoxNzY5MTQ1NjczLCJleHAiOjIwODQ3MjE2NzN9.g-EWXfkesnZx5urr17c5VJS2iFHRVdEQoO0ngX51vUw"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Generate video
                  </a>
                </Button>
                <PostToSocialsButton />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Subscription Plans Management</h2>
                <p className="text-gray-300">Manage pricing plans and user subscriptions</p>
              </div>
              <Button
                onClick={() => window.location.href = '/admin/plans'}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="button-manage-plans"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Plans
              </Button>
            </div>

            <Card className="bg-black/30 border-purple-500/20">
              <CardContent className="p-6">
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Plans Management</h3>
                  <p className="text-gray-300 mb-4">
                    Create and manage subscription plans, set pricing tiers, and configure credit allocations for your users.
                  </p>
                  <Button
                    onClick={() => window.location.href = '/admin/plans'}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Go to Plans Management
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="statistics" className="space-y-6">
            <UsageStatistics />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SiteSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}