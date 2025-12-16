import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Send, Loader2, Calendar as CalendarIcon, Gift } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface SendGreetingCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  videoTitle: string;
}

export function SendGreetingCardModal({ isOpen, onClose, projectId, videoTitle }: SendGreetingCardModalProps) {
  const { toast } = useToast();
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sendOption, setSendOption] = useState<'now' | 'later'>('now');
  const [scheduledDate, setScheduledDate] = useState<Date>(addDays(new Date(), 1));
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScheduledDate(addDays(new Date(), 1));
    }
  }, [isOpen]);

  const sendGreetingCardMutation = useMutation({
    mutationFn: async (data: {
      projectId: string;
      senderEmail: string;
      senderName: string;
      recipientEmail: string;
      message: string;
      scheduledDate: Date;
    }) => {
      const response = await apiRequest('POST', '/api/greeting-cards', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Greeting card scheduled!',
        description: sendOption === 'now' 
          ? 'Your greeting card will be sent shortly.'
          : `Your greeting card will be sent on ${format(scheduledDate, 'PPP')}.`,
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: 'Failed to send',
        description: error instanceof Error ? error.message : 'Failed to send greeting card',
        variant: 'destructive',
      });
    },
  });

  const handleSend = () => {
    if (!senderEmail.trim()) {
      toast({
        title: 'Email required',
        description: 'Please enter your email address.',
        variant: 'destructive',
      });
      return;
    }

    if (!recipientEmail.trim()) {
      toast({
        title: 'Recipient email required',
        description: 'Please enter the recipient\'s email address.',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(senderEmail)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid sender email address.',
        variant: 'destructive',
      });
      return;
    }

    if (!emailRegex.test(recipientEmail)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid recipient email address.',
        variant: 'destructive',
      });
      return;
    }

    const sendDate = sendOption === 'now' ? new Date() : scheduledDate;

    sendGreetingCardMutation.mutate({
      projectId,
      senderEmail: senderEmail.trim(),
      senderName: senderName.trim(),
      recipientEmail: recipientEmail.trim(),
      message: message.trim(),
      scheduledDate: sendDate,
    });
  };

  const handleClose = () => {
    if (!sendGreetingCardMutation.isPending) {
      onClose();
      setSenderEmail('');
      setSenderName('');
      setRecipientEmail('');
      setMessage('');
      setSendOption('now');
      setScheduledDate(addDays(new Date(), 1));
    }
  };

  const tomorrow = addDays(new Date(), 1);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Gift className="h-5 w-5 text-pink-500" />
            <span>Send as Greeting Card</span>
          </DialogTitle>
          <DialogDescription>
            Send "{videoTitle}" as a personalized greeting card to someone special.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sender-name">Your Name</Label>
            <Input
              id="sender-name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Enter your name"
              disabled={sendGreetingCardMutation.isPending}
              data-testid="input-sender-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender-email">Your Email *</Label>
            <Input
              id="sender-email"
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={sendGreetingCardMutation.isPending}
              data-testid="input-sender-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient-email">Recipient's Email *</Label>
            <Input
              id="recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@email.com"
              disabled={sendGreetingCardMutation.isPending}
              data-testid="input-recipient-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Personal Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a personal message to include with the video..."
              rows={3}
              disabled={sendGreetingCardMutation.isPending}
              data-testid="input-greeting-message"
            />
          </div>

          <div className="space-y-3">
            <Label>When to send</Label>
            <RadioGroup 
              value={sendOption} 
              onValueChange={(value) => setSendOption(value as 'now' | 'later')}
              disabled={sendGreetingCardMutation.isPending}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="now" id="send-now" data-testid="radio-send-now" />
                <Label htmlFor="send-now" className="font-normal cursor-pointer">Send now</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="later" id="send-later" data-testid="radio-send-later" />
                <Label htmlFor="send-later" className="font-normal cursor-pointer">Send later</Label>
              </div>
            </RadioGroup>

            {sendOption === 'later' && (
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !scheduledDate && "text-muted-foreground"
                    )}
                    disabled={sendGreetingCardMutation.isPending}
                    data-testid="button-select-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, 'PPP') : 'Select a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={(date) => {
                      if (date) {
                        setScheduledDate(date);
                        setCalendarOpen(false);
                      }
                    }}
                    disabled={(date) => date < tomorrow}
                    initialFocus
                    data-testid="calendar-schedule"
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={sendGreetingCardMutation.isPending}
              data-testid="button-cancel-greeting"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendGreetingCardMutation.isPending}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              data-testid="button-send-greeting"
            >
              {sendGreetingCardMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {sendOption === 'now' ? 'Send Now' : 'Schedule'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
