import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Image, Loader2, Globe, User, AlertTriangle, Crown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface SavedCharacter {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

interface PublicCharacter {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string;
}

interface CharacterLimitInfo {
  count: number;
  limit: number | null;
  isFreePlan: boolean;
  isAtLimit: boolean;
  canCreate: boolean;
}

const PUBLIC_CHARACTERS: PublicCharacter[] = [
  { id: 'public-1', name: 'Cyberpunk Redhead', prompt: 'A stunning cyberpunk woman with vibrant red hair, neon accents, futuristic style', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382029/1412fc0a940a4c09927107d76c92ff7c_ugzbfh.jpg' },
  { id: 'public-2', name: 'Futuristic Woman', prompt: 'A beautiful woman in futuristic attire with sci-fi elements and modern styling', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382029/4154969e45fe42ad8d230b079fa9ebfd_jh2wv4.jpg' },
  { id: 'public-3', name: 'Albert Einstein Rockstar', prompt: 'Albert Einstein as a rockstar with wild hair, leather jacket, and rock and roll attitude', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382028/3d50ff8c491249d29a470b8260e031cc_lxhba0.jpg' },
  { id: 'public-4', name: 'Victorian Woman', prompt: 'An elegant Victorian era woman in period dress with classic styling and refined features', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382027/a889089dc1574876a1944f967a275087_fbappb.jpg' },
  { id: 'public-5', name: 'Rocker Panda', prompt: 'A cool panda bear dressed as a rock star with sunglasses and rock attitude', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382027/1fbaaceac1d24d3e95e7ba76306ffee9_tu9dbf.jpg' },
  { id: 'public-6', name: 'Punk Squirrel', prompt: 'A punk rock squirrel with mohawk, edgy style, and rebellious attitude', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382027/688a4e97c32047fb8a463ea9e7b8cee6_t3kzcl.jpg' },
  { id: 'public-7', name: 'Hiphop Cat 2', prompt: 'A stylish cat with hip hop fashion, urban style, gold chains, and street attitude', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767382026/2074cc0f387b4c5aa74157190f0ffe9f_gqhtmn.jpg' },
  { id: 'public-8', name: 'Futuristic Woman', prompt: 'A sleek futuristic woman with advanced technology aesthetic and sci-fi styling', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767381128/27ad996daded40928b66f03eaa9de728_tzy64a.jpg' },
  { id: 'public-9', name: 'Futuristic Man', prompt: 'A handsome futuristic man with sci-fi elements, modern technology aesthetic', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767381128/ec5c4a16e078471fa489ca4d6169d9ab_yeu937.jpg' },
  { id: 'public-10', name: 'Hiphop Woman', prompt: 'A fashionable hip hop woman with urban style, street fashion, and confident attitude', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767381128/7e921653bb974064b7856dcc6d3bdd2a_hyindj.jpg' },
  { id: 'public-11', name: 'Hiphop Man', prompt: 'A stylish hip hop man with urban fashion, street style, and cool demeanor', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767380967/8f6589295772449689714afcca341f7c_peaknk.jpg' },
  { id: 'public-12', name: 'Rockstar Kitty', prompt: 'A cute cat dressed as a rock star with guitar, stage outfit, and musical flair', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767380967/2d92b1eb6ffa4375bd116a7f147b9c75_swphhp.jpg' },
  { id: 'public-13', name: 'Rapper Mouse', prompt: 'A cool mouse as a rapper with hip hop fashion, microphone, and street style', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1767380967/5185482094d847158c98328bc0f238fe_uovof0.jpg' },
  { id: 'public-14', name: 'Santa Kitty', prompt: 'An adorable cat dressed as Santa Claus with festive Christmas outfit and holiday spirit', imageUrl: 'https://res.cloudinary.com/dqemas8ht/image/upload/v1766076165/xmascat_u6elsh.jpg' },
];

interface CharacterLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: SavedCharacter) => void;
}

export function CharacterLibraryModal({ isOpen, onClose, onSelect }: CharacterLibraryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCharacter, setSelectedCharacter] = useState<SavedCharacter | null>(null);
  const [selectedPublicCharacter, setSelectedPublicCharacter] = useState<PublicCharacter | null>(null);
  const [activeTab, setActiveTab] = useState('public');

  const { data: characters, isLoading } = useQuery<SavedCharacter[]>({
    queryKey: ['/api/characters'],
    enabled: isOpen,
  });

  const { data: limitInfo } = useQuery<CharacterLimitInfo>({
    queryKey: ['/api/characters/limit'],
    enabled: isOpen,
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      await apiRequest('DELETE', `/api/characters/${characterId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/characters/limit'] });
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
    if (activeTab === 'public' && selectedPublicCharacter) {
      onSelect({
        id: selectedPublicCharacter.id,
        name: selectedPublicCharacter.name,
        prompt: selectedPublicCharacter.prompt,
        imageUrl: selectedPublicCharacter.imageUrl,
        createdAt: new Date().toISOString(),
      });
      onClose();
    } else if (activeTab === 'my-characters' && selectedCharacter) {
      onSelect(selectedCharacter);
      onClose();
    }
  };

  const handleDelete = (e: React.MouseEvent, characterId: string) => {
    e.stopPropagation();
    deleteCharacterMutation.mutate(characterId);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSelectedCharacter(null);
    setSelectedPublicCharacter(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-4xl max-h-[85vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-base sm:text-lg">
            <Image className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Character Library</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="public" className="flex items-center gap-2" data-testid="tab-public-characters">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Public Characters</span>
              <span className="sm:hidden">Public</span>
            </TabsTrigger>
            <TabsTrigger value="my-characters" className="flex items-center gap-2" data-testid="tab-my-characters">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">My Characters</span>
              <span className="sm:hidden">Mine</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="public" className="flex-1 flex flex-col min-h-0 mt-0">
            <div className="flex-1 overflow-y-auto p-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                {PUBLIC_CHARACTERS.map((character) => (
                  <Card
                    key={character.id}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      selectedPublicCharacter?.id === character.id
                        ? 'ring-2 ring-primary shadow-lg'
                        : ''
                    }`}
                    onClick={() => setSelectedPublicCharacter(character)}
                    data-testid={`public-character-${character.id}`}
                  >
                    <CardContent className="p-2 sm:p-3">
                      <img
                        src={character.imageUrl}
                        alt={character.name}
                        className="w-full aspect-square object-cover rounded-md mb-2 sm:mb-3"
                      />
                      <h4 className="font-medium text-xs sm:text-sm truncate" title={character.name}>
                        {character.name}
                      </h4>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-4 pt-4 border-t">
              <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                {PUBLIC_CHARACTERS.length} public character{PUBLIC_CHARACTERS.length !== 1 ? 's' : ''} available
              </p>
              <div className="flex space-x-2 justify-center sm:justify-end">
                <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-public">
                  Cancel
                </Button>
                <Button
                  onClick={handleSelect}
                  disabled={!selectedPublicCharacter}
                  size="sm"
                  className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-xs sm:text-sm"
                  data-testid="button-select-public-character"
                >
                  Use Selected
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="my-characters" className="flex-1 flex flex-col min-h-0 mt-0">
            {limitInfo?.isAtLimit && (
              <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>
                      You've reached the limit of {limitInfo.limit} saved characters. 
                      Delete some characters or subscribe to save unlimited characters.
                    </span>
                    <Link href="/plans?trial=1" onClick={onClose}>
                      <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 whitespace-nowrap">
                        <Crown className="h-3 w-3 mr-1" />
                        Start $1 Trial
                      </Button>
                    </Link>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
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
                <div className="flex-1 overflow-y-auto p-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
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
                        <CardContent className="p-2 sm:p-3">
                          <div className="relative">
                            <img
                              src={character.imageUrl}
                              alt={character.name}
                              className="w-full aspect-square object-cover rounded-md mb-2 sm:mb-3"
                            />
                            <Button
                              variant="destructive"
                              size="sm"
                              className="absolute top-1 right-1 h-6 w-6 p-0 opacity-70 sm:opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                              onClick={(e) => handleDelete(e, character.id)}
                              disabled={deleteCharacterMutation.isPending}
                              data-testid={`delete-character-${character.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <div className="space-y-1 sm:space-y-2">
                            <h4 className="font-medium text-xs sm:text-sm truncate" title={character.name}>
                              {character.name}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 hidden sm:block" title={character.prompt}>
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
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-4 pt-4 border-t">
                  <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                    {characters.length}{limitInfo?.isFreePlan ? `/${limitInfo.limit}` : ''} character{characters.length !== 1 ? 's' : ''} in your library
                  </p>
                  <div className="flex space-x-2 justify-center sm:justify-end">
                    <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSelect}
                      disabled={!selectedCharacter}
                      size="sm"
                      className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-xs sm:text-sm"
                      data-testid="button-select-character"
                    >
                      Use Selected
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
