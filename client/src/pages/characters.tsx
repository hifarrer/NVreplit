import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Search, Trash2, Users, Loader2, Plus, Edit3, AlertTriangle, Crown, ChevronLeft, ChevronRight } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";

interface SavedCharacter {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

interface CharacterLimitInfo {
  count: number;
  limit: number | null;
  isFreePlan: boolean;
  isAtLimit: boolean;
  canCreate: boolean;
}

const PAGE_SIZE = 20;

export default function CharactersPage() {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: characters = [], isLoading } = useQuery<SavedCharacter[]>({
    queryKey: ['/api/characters'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: limitInfo } = useQuery<CharacterLimitInfo>({
    queryKey: ['/api/characters/limit'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      // Get the auth token
      const token = localStorage.getItem('auth_token');
      
      // Make the request directly to handle 404 properly
      const response = await fetch(`/api/characters/${characterId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });
      
      // Both 200 and 404 are success cases for deletion
      if (response.ok || response.status === 404) {
        return { success: true };
      }
      
      // Only throw for real errors (500, 403, 401, etc)
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to delete character');
    },
    onSuccess: () => {
      // Always invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/characters/limit'] });
      
      // Show success message
      toast({
        title: "Character deleted",
        description: "The character has been successfully removed from your library.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to delete character. Please try again.",
        variant: "destructive",
      });
    }
  });

  const updateCharacterMutation = useMutation({
    mutationFn: async ({ characterId, name }: { characterId: string; name: string }) => {
      const response = await apiRequest('PATCH', `/api/characters/${characterId}`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      setEditingCharacter(null);
      setEditingName("");
      toast({
        title: "Character updated",
        description: "The character name has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update character name. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleStartEdit = (character: SavedCharacter) => {
    setEditingCharacter(character.id);
    setEditingName(character.name);
  };

  const handleSaveEdit = (characterId: string) => {
    if (editingName.trim()) {
      updateCharacterMutation.mutate({ characterId, name: editingName.trim() });
    }
  };

  const handleCancelEdit = () => {
    setEditingCharacter(null);
    setEditingName("");
  };

  const filteredCharacters = characters.filter(character =>
    character.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    character.prompt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredCharacters.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedCharacters = filteredCharacters.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when search changes; clamp page when list shrinks
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading your characters...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavigationHeader currentPage="characters" />

      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold gradient-text flex items-center">
              <Users className="h-8 w-8 mr-3" />
              Characters
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your saved AI-generated characters
            </p>
          </div>
          <Button
            onClick={() => navigate("/create/character-creator")}
            className="floating-button"
            disabled={limitInfo?.isFreePlan && limitInfo?.isAtLimit}
            data-testid="create-character-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Character
          </Button>
        </div>

        {limitInfo?.isFreePlan && limitInfo?.isAtLimit && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>
                  You've reached the limit of {limitInfo.limit} saved characters on the Free plan. 
                  Delete some characters or upgrade to save unlimited characters and create more.
                </span>
                <Link href="/plans">
                  <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap">
                    <Crown className="h-3 w-3 mr-1" />
                    Upgrade Plan
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search characters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="search-characters"
            />
          </div>
        </div>

        {/* Characters Grid */}
        {filteredCharacters.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">
              {searchTerm ? "No characters found" : "No characters saved yet"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {searchTerm 
                ? "Try adjusting your search terms to find the characters you're looking for."
                : "Create your first AI character to start building your character library."
              }
            </p>
            {!searchTerm && (
              <Button 
                onClick={() => navigate("/create/character-creator")}
                className="floating-button" 
                data-testid="create-first-character"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Character
              </Button>
            )}
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedCharacters.map((character) => (
              <Card key={character.id} className="group hover:shadow-lg transition-shadow" data-testid={`character-card-${character.id}`}>
                <CardContent className="p-4">
                  <div className="relative mb-4">
                    <img
                      src={character.imageUrl}
                      alt={character.name}
                      className="w-full h-48 object-cover rounded-lg"
                      data-testid={`character-image-${character.id}`}
                    />
                    <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEdit(character)}
                        disabled={updateCharacterMutation.isPending}
                        className="w-8 h-8 p-0 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                        data-testid={`edit-character-${character.id}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteCharacterMutation.mutate(character.id)}
                        disabled={deleteCharacterMutation.isPending}
                        className="w-8 h-8 p-0 bg-red-600 hover:bg-red-700"
                        data-testid={`delete-character-${character.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {editingCharacter === character.id ? (
                      <div className="flex items-center space-x-2">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="text-sm font-semibold"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(character.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                          data-testid={`character-name-input-${character.id}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveEdit(character.id)}
                          disabled={updateCharacterMutation.isPending || !editingName.trim()}
                          className="px-2"
                          data-testid={`save-character-name-${character.id}`}
                        >
                          ✓
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="px-2"
                          data-testid={`cancel-character-name-${character.id}`}
                        >
                          Exit
                        </Button>
                      </div>
                    ) : (
                      <h3 className="font-semibold text-sm" data-testid={`character-name-${character.id}`}>
                        {character.name}
                      </h3>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`character-prompt-${character.id}`}>
                      {character.prompt}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(character.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground order-2 sm:order-1">
                Page {currentPage} of {totalPages}
                <span className="ml-2 text-muted-foreground/80">
                  ({(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCharacters.length)} of {filteredCharacters.length})
                </span>
              </p>
              <div className="flex items-center gap-2 order-1 sm:order-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          </>
        )}

        {/* Stats */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            {filteredCharacters.length}{limitInfo?.isFreePlan && limitInfo.limit ? `/${limitInfo.limit}` : ''} character{filteredCharacters.length !== 1 ? 's' : ''} 
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}