import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Search, Trash2, Users, Loader2 } from "lucide-react";

interface SavedCharacter {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

export default function CharactersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: characters = [], isLoading } = useQuery<SavedCharacter[]>({
    queryKey: ['/api/saved-characters'],
    queryFn: getQueryFn(),
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      const response = await apiRequest('DELETE', `/api/saved-characters/${characterId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-characters'] });
      toast({
        title: "Character deleted",
        description: "The character has been removed from your library.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete character. Please try again.",
        variant: "destructive",
      });
    }
  });

  const filteredCharacters = characters.filter(character =>
    character.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    character.prompt.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="back-to-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Create
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold gradient-text flex items-center">
                <Users className="h-8 w-8 mr-3" />
                Characters
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your saved AI-generated characters
              </p>
            </div>
          </div>
        </div>

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
              <Link href="/">
                <Button className="floating-button" data-testid="create-first-character">
                  Create Your First Character
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredCharacters.map((character) => (
              <Card key={character.id} className="group hover:shadow-lg transition-shadow" data-testid={`character-card-${character.id}`}>
                <CardContent className="p-4">
                  <div className="relative mb-4">
                    <img
                      src={character.imageUrl}
                      alt={character.name}
                      className="w-full h-48 object-cover rounded-lg"
                      data-testid={`character-image-${character.id}`}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteCharacterMutation.mutate(character.id)}
                      disabled={deleteCharacterMutation.isPending}
                      className="absolute top-2 right-2 w-8 h-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700"
                      data-testid={`delete-character-${character.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm" data-testid={`character-name-${character.id}`}>
                      {character.name}
                    </h3>
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
        )}

        {/* Stats */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            {filteredCharacters.length} character{filteredCharacters.length !== 1 ? 's' : ''} 
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
      </div>
    </div>
  );
}