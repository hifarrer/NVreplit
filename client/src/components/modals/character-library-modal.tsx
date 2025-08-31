import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Image, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SavedCharacter {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

interface CharacterLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: SavedCharacter) => void;
}

export function CharacterLibraryModal({ isOpen, onClose, onSelect }: CharacterLibraryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<SavedCharacter | null>(null);

  const { data: characters, isLoading } = useQuery<SavedCharacter[]>({
    queryKey: ['/api/characters'],
    enabled: isOpen,
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      await apiRequest('DELETE', `/api/characters/${characterId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      toast({
        title: 'Character deleted',
        description: 'The character has been removed from your library.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete character',
        variant: 'destructive',
      });
    },
  });

  const handleSelect = () => {
    if (selectedCharacter) {
      onSelect(selectedCharacter);
      onClose();
    }
  };

  const handleDelete = (e: React.MouseEvent, characterId: string) => {
    e.stopPropagation();
    deleteCharacterMutation.mutate(characterId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Image className="h-5 w-5" />
            <span>My Character Library</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-full">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Loading your characters...</p>
              </div>
            </div>
          ) : !characters || characters.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <Image className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No saved characters</h3>
                <p className="text-muted-foreground">
                  Generate a character and save it to build your character library.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-1 overflow-y-auto p-1">
                {characters.map((character) => (
                  <Card
                    key={character.id}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      selectedCharacter?.id === character.id
                        ? 'ring-2 ring-primary shadow-lg'
                        : ''
                    }`}
                    onClick={() => setSelectedCharacter(character)}
                    data-testid={`character-${character.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="relative">
                        <img
                          src={character.imageUrl}
                          alt={character.name}
                          className="w-full aspect-square object-cover rounded-md mb-3"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDelete(e, character.id)}
                          disabled={deleteCharacterMutation.isPending}
                          data-testid={`delete-character-${character.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm truncate" title={character.name}>
                          {character.name}
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2" title={character.prompt}>
                          {character.prompt}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {new Date(character.createdAt).toLocaleDateString()}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  {characters.length} character{characters.length !== 1 ? 's' : ''} in your library
                </p>
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={onClose} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSelect}
                    disabled={!selectedCharacter}
                    className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600"
                    data-testid="button-select-character"
                  >
                    Use Selected Character
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}