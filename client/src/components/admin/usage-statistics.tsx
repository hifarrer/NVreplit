import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Activity, TrendingUp, Users, Calendar, Loader2 } from "lucide-react";

interface ChartData {
  date: string;
  count: number;
}

interface StatsData {
  overview: {
    totalUsers: number;
    totalProjects: number;
    totalSongs: number;
    completedProjects: number;
  };
  charts: {
    userSignups: ChartData[];
    projectCreations: ChartData[];
  };
}

export function UsageStatistics() {
  // Fetch admin stats with auth header
  const { data: stats, isLoading } = useQuery<StatsData>({
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
  });

  if (isLoading) {
    return (
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="text-center py-12 text-gray-400">
          Failed to load statistics
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data with proper formatting
  const userSignupsData = stats.charts.userSignups.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    signups: item.count
  }));

  const projectCreationsData = stats.charts.projectCreations.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    projects: item.count
  }));

  // Calculate completion rate
  const completionRate = stats.overview.totalProjects > 0 
    ? ((stats.overview.completedProjects / stats.overview.totalProjects) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-black/30 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-sm font-medium text-gray-300">Total Users</p>
                <p className="text-2xl font-bold text-white">{stats.overview.totalUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/30 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-sm font-medium text-gray-300">Total Projects</p>
                <p className="text-2xl font-bold text-white">{stats.overview.totalProjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/30 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-sm font-medium text-gray-300">Completion Rate</p>
                <p className="text-2xl font-bold text-white">{completionRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/30 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-sm font-medium text-gray-300">Songs Created</p>
                <p className="text-2xl font-bold text-white">{stats.overview.totalSongs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Signups Chart */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white">User Signups Over Time</CardTitle>
          <CardDescription className="text-gray-300">
            New user registrations by day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userSignupsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #6B21A8',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }}
                />
                <Bar 
                  dataKey="signups" 
                  fill="#9333EA" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Project Creations Chart */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white">Project Creations Over Time</CardTitle>
          <CardDescription className="text-gray-300">
            New projects created by day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projectCreationsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #6B21A8',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="projects" 
                  stroke="#9333EA" 
                  strokeWidth={3}
                  dot={{ fill: '#9333EA', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#A855F7' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Usage Summary */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white">Usage Summary</CardTitle>
          <CardDescription className="text-gray-300">
            Platform usage insights and trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">Average Projects per User</div>
                <div className="text-sm text-gray-400">Based on current user base</div>
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {stats.overview.totalUsers > 0 
                  ? (stats.overview.totalProjects / stats.overview.totalUsers).toFixed(1)
                  : "0"
                }
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">Average Songs per User</div>
                <div className="text-sm text-gray-400">Music generation activity</div>
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {stats.overview.totalUsers > 0 
                  ? (stats.overview.totalSongs / stats.overview.totalUsers).toFixed(1)
                  : "0"
                }
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-800/30 rounded-lg">
              <div>
                <div className="font-medium text-white">Project Completion Rate</div>
                <div className="text-sm text-gray-400">Percentage of finished projects</div>
              </div>
              <div className="text-2xl font-bold text-green-400">
                {completionRate}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}