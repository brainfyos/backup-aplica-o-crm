import { useState, useEffect } from 'react';
import { useLead, useUpdateLead } from '@/hooks/useLeads';
import { useCreateInteraction } from '@/hooks/useInteractions';
import { useAuth } from '@/hooks/useAuth';
import { LeadTimeline } from './LeadTimeline';
import { LeadAttributionCard } from './LeadAttributionCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  User, 
  Building, 
  Mail, 
  Phone, 
  Flame,
  ThermometerSun,
  Snowflake,
  Calendar,
  Loader2,
  MessageSquare,
  Plus,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
}

const channelOptions = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Ligação' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'other', label: 'Outro' },
];

export function LeadDetailModal({ isOpen, onClose, leadId }: LeadDetailModalProps) {
  const { user } = useAuth();
  const { data: lead, isLoading } = useLead(leadId);
  const updateLead = useUpdateLead();
  const createInteraction = useCreateInteraction();
  
  const [activeTab, setActiveTab] = useState('timeline');
  const [interactionChannel, setInteractionChannel] = useState<string>('whatsapp');
  const [interactionContent, setInteractionContent] = useState('');
  const [interactionDirection, setInteractionDirection] = useState<string>('outbound');
  const [notes, setNotes] = useState('');
  const [isAddingInteraction, setIsAddingInteraction] = useState(false);

  const getTemperatureIcon = (temp: string | null) => {
    switch (temp) {
      case 'hot': return <Flame size={16} className="text-destructive" />;
      case 'warm': return <ThermometerSun size={16} className="text-warning" />;
      case 'cold': return <Snowflake size={16} className="text-blue-400" />;
      default: return null;
    }
  };

  const handleAddInteraction = async () => {
    if (!interactionContent.trim()) {
      toast.error('Conteúdo é obrigatório');
      return;
    }

    try {
      await createInteraction.mutateAsync({
        lead_id: leadId,
        user_id: user?.id,
        channel: interactionChannel as any,
        direction: interactionDirection,
        content: interactionContent,
        cadence_day: lead?.cadence_day
      });
      toast.success('Interação registrada!');
      setInteractionContent('');
      setIsAddingInteraction(false);
    } catch (error) {
      toast.error('Erro ao registrar interação');
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateLead.mutateAsync({
        id: leadId,
        notes: notes
      });
      toast.success('Notas salvas!');
    } catch (error) {
      toast.error('Erro ao salvar notas');
    }
  };

  // Update notes when lead loads
  useEffect(() => {
    if (lead?.notes) {
      setNotes(lead.notes);
    }
  }, [lead?.notes]);

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!lead) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={20} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span>{lead.name}</span>
                {getTemperatureIcon(lead.temperature)}
              </div>
              {lead.company && (
                <p className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                  <Building size={12} />
                  {lead.company}
                </p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Lead Info Cards */}
        <div className="grid grid-cols-3 gap-3 py-4 border-y border-border">
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-foreground truncate">
              {lead.email || '-'}
            </p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Telefone</p>
            <p className="text-sm font-medium text-foreground">
              {lead.phone || '-'}
            </p>
          </div>
          <div className="text-center p-2">
            <p className="text-xs text-muted-foreground">Último contato</p>
            <p className="text-sm font-medium text-foreground">
              {lead.last_contact_at 
                ? format(new Date(lead.last_contact_at), "dd/MM/yyyy", { locale: ptBR })
                : 'Nunca'
              }
            </p>
          </div>
        </div>

        {/* Current Stage & Cadence */}
        <div className="flex items-center gap-4 py-2">
          {lead.pipeline_stages && (
            <Badge 
              style={{ 
                backgroundColor: `${lead.pipeline_stages.color}20`,
                color: lead.pipeline_stages.color,
                borderColor: lead.pipeline_stages.color
              }}
              className="border"
            >
              {lead.pipeline_stages.name}
            </Badge>
          )}
          {lead.cadence_day && (
            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">
              <Calendar size={12} className="mr-1" />
              Dia {lead.cadence_day} da cadência
            </Badge>
          )}
        </div>

        {/* Attribution */}
        <LeadAttributionCard leadId={leadId} leadCreatedAt={lead.created_at ?? null} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <MessageSquare size={14} />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <Save size={14} />
              Notas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="flex-1 overflow-hidden mt-4">
            {/* Add Interaction Button */}
            {!isAddingInteraction ? (
              <Button 
                variant="outline" 
                className="w-full mb-4"
                onClick={() => setIsAddingInteraction(true)}
              >
                <Plus size={16} className="mr-2" />
                Registrar Interação
              </Button>
            ) : (
              <div className="bg-secondary/30 rounded-lg p-4 mb-4 space-y-3 border border-border">
                <div className="flex gap-2">
                  <Select value={interactionChannel} onValueChange={setInteractionChannel}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {channelOptions.map(ch => (
                        <SelectItem key={ch.value} value={ch.value}>
                          {ch.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={interactionDirection} onValueChange={setInteractionDirection}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Enviado</SelectItem>
                      <SelectItem value="inbound">Recebido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Descreva a interação..."
                  value={interactionContent}
                  onChange={(e) => setInteractionContent(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setIsAddingInteraction(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleAddInteraction}
                    disabled={createInteraction.isPending}
                  >
                    {createInteraction.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              </div>
            )}

            <LeadTimeline leadId={leadId} maxHeight="280px" />
          </TabsContent>

          <TabsContent value="notes" className="flex-1 overflow-hidden mt-4">
            <div className="space-y-3">
              <Textarea
                placeholder="Adicione notas sobre este lead..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                className="resize-none"
              />
              <Button 
                className="w-full"
                onClick={handleSaveNotes}
                disabled={updateLead.isPending}
              >
                {updateLead.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save size={16} className="mr-2" />
                )}
                Salvar Notas
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
