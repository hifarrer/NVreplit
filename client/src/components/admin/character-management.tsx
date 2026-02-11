import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, ImageIcon, User, Calendar, Mail, CreditCard, Music, Video, Eye } from "lucide-react";
import { convertAvatarUrlToImageKit } from "@/lib/utils";

interface CharacterWithUser {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
}

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
}

interface CharactersResponse {
  characters: CharacterWithUser[];
}

export function CharacterManagement() {
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [viewingCharacter, setViewingCharacter] = useState<CharacterWithUser | null>(null);

  // Fetch all characters with user info
  const { data: charactersData, isLoading } = useQuery<CharactersResponse>({
    queryKey: ["/api/admin/characters"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/characters", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch characters");
      return res.json();
    },
  });

  const characters = charactersData?.characters || [];

  const handleUsernameClick = async (character: CharacterWithUser) => {
    // Fetch user details
    const token = localStorage.getItem("adminToken");
    const params = new URLSearchParams({
      page: "1",
      limit: "1000", // Get all users to find the one we need
    });
    try {
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const user = data.users.find((u: UserWithStats) => u.id === character.user.id);
        if (user) {
          setSelectedUser(user);
        }
      }
    } catch (error) {
      console.error("Failed to fetch user details:", error);
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
    <>
      <Card className="bg-black/30 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <ImageIcon className="h-5 w-5 mr-2" />
            Character Management
          </CardTitle>
          <CardDescription className="text-gray-300">
            View all character images created by users, ordered by creation date (most recent first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {characters.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No characters found
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {characters.map((character) => (
                <div
                  key={character.id}
                  className="bg-gray-800/50 rounded-lg border border-gray-600/30 hover:border-purple-500/50 transition-colors overflow-hidden"
                >
                  <div 
                    className="relative aspect-square cursor-pointer"
                    onClick={() => setViewingCharacter(character)}
                  >
                    <img
                      src={character.imageUrl}
                      alt={character.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors" />
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium text-white mb-1 truncate" title={character.name}>
                      {character.name}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUsernameClick(character);
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 hover:underline transition-colors flex items-center gap-1"
                    >
                      <User className="h-3 w-3" />
                      {character.user.username}
                    </button>
                    <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(character.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Character Detail Dialog */}
      <Dialog open={!!viewingCharacter} onOpenChange={() => setViewingCharacter(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">{viewingCharacter?.name}</DialogTitle>
            <DialogDescription className="text-gray-300">
              Created by {viewingCharacter?.user.username} on {viewingCharacter && new Date(viewingCharacter.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {viewingCharacter && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={viewingCharacter.imageUrl}
                  alt={viewingCharacter.name}
                  className="max-w-full max-h-96 object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Prompt:</div>
                <div className="text-white">{viewingCharacter.prompt}</div>
              </div>
              <button
                onClick={() => handleUsernameClick(viewingCharacter)}
                className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
              >
                View user details →
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center">
              <User className="h-5 w-5 mr-2" />
              User Details
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedUser.avatarUrl ? convertAvatarUrlToImageKit(selectedUser.avatarUrl) || selectedUser.avatarUrl : undefined} />
                  <AvatarFallback className="bg-purple-600 text-white">
                    {selectedUser.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-xl font-semibold text-white">{selectedUser.username}</div>
                  <div className="text-sm text-gray-400">{selectedUser.email}</div>
                  <Badge 
                    variant="outline" 
                    className={`mt-1 ${
                      selectedUser.emailVerified 
                        ? 'border-green-500/30 text-green-400 bg-green-500/10' 
                        : 'border-orange-500/30 text-orange-400 bg-orange-500/10'
                    }`}
                  >
                    {selectedUser.emailVerified ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1">Plan</div>
                  <div className="text-white font-medium">{selectedUser.planName || "Free"}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1">Credits</div>
                  <div className="text-white font-medium">
                    {selectedUser.creditsUsed?.toLocaleString() || 0} / {selectedUser.creditsLimit?.toLocaleString() || 0}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    Projects
                  </div>
                  <div className="text-white font-medium">{selectedUser.projectCount}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                    <Music className="h-3 w-3" />
                    Songs
                  </div>
                  <div className="text-white font-medium">{selectedUser.songCount}</div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Member Since
                </div>
                <div className="text-white">
                  {new Date(selectedUser.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`/u/${selectedUser.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-center py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  View Profile
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
