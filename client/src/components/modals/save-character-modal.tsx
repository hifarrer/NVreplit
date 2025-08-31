import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SaveCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  prompt: string;
}

export function SaveCharacterModal({ isOpen, onClose, imageUrl, prompt }: SaveCharacterModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editedPrompt, setEditedPrompt] = useState(prompt);

  const saveCharacterMutation = useMutation({
    mutationFn: async (data: { name: string; prompt: string; imageUrl: string }) => {
      const response = await apiRequest('POST', '/api/characters', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      toast({
        title: 'Character saved!',
        description: 'The character has been added to your library.',
      });
      onClose();
      setName('');
      setEditedPrompt(prompt);
    },
    onError: (error) => {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save character',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for your character.',
        variant: 'destructive',
      });
      return;
    }

    saveCharacterMutation.mutate({
      name: name.trim(),
      prompt: editedPrompt,
      imageUrl,
    });
  };

  const handleClose = () => {
    if (!saveCharacterMutation.isPending) {
      onClose();
      setName('');
      setEditedPrompt(prompt);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Save className="h-5 w-5" />
            <span>Save Character</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Character preview */}
          <div className="flex justify-center">
            <img
              src={imageUrl}
              alt="Character preview"
              className="w-32 h-32 object-cover rounded-lg border"
            />
          </div>

          {/* Character name input */}
          <div className="space-y-2">
            <Label htmlFor="character-name">Character Name</Label>
            <Input
              id="character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this character"
              disabled={saveCharacterMutation.isPending}
              data-testid="input-character-name"
            />
          </div>

          {/* Character prompt */}
          <div className="space-y-2">
            <Label htmlFor="character-prompt">Character Description</Label>
            <Textarea
              id="character-prompt"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              placeholder="Describe this character..."
              rows={3}
              disabled={saveCharacterMutation.isPending}
              data-testid="input-character-prompt"
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={saveCharacterMutation.isPending}
              data-testid="button-cancel-save"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveCharacterMutation.isPending || !name.trim()}
              className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600"
              data-testid="button-save-character"
            >
              {saveCharacterMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Character
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}