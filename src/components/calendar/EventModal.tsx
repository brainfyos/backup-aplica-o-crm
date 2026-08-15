import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Clock, MapPin, Users, Bell, Link2, X, Video, Check, ChevronsUpDown, UserPlus, Sparkles, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useCreateEvent, useUpdateEvent, CalendarEvent, CreateEventData } from '@/hooks/useCalendarEvents';
import { useProducts } from '@/hooks/useProducts';
import { useLeads, useCreateLead } from '@/hooks/useLeads';
import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';
import { useBookingEventTypes } from '@/hooks/useBookingEventTypes';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface EventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  defaultDate?: Date;
  defaultLeadId?: string;
  defaultProductId?: string;
}

const EVENT_TYPES = [
  { value: 'meeting', label: '🤝 Reunião', color: 'bg-blue-500' },
  { value: 'call', label: '📞 Ligação', color: 'bg-green-500' },
  { value: 'demo', label: '🎯 Demo', color: 'bg-purple-500' },
  { value: 'follow_up', label: '📋 Follow-up', color: 'bg-orange-500' },
  { value: 'other', label: '📌 Outro', color: 'bg-gray-500' },
];

const REMINDER_OPTIONS = [
  { value: 5, label: '5 minutos antes' },
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
];

function normalizePhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function EventModal({ open, onOpenChange, event, defaultDate, defaultLeadId, defaultProductId }: EventModalProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const createLead = useCreateLead();
  const { data: products } = useProducts();
  const { data: leads, refetch: refetchLeads } = useLeads();
  const { isConnected } = useGoogleCalendarConnection();
  const { eventTypes: bookingEventTypes } = useBookingEventTypes();

  const [formData, setFormData] = useState<CreateEventData & { create_meet?: boolean; booking_event_type_id?: string }>({
    title: '',
    description: '',
    location: '',
    event_type: 'meeting',
    start_time: '',
    end_time: '',
    all_day: false,
    lead_id: undefined,
    product_id: undefined,
    reminder_minutes: [15, 60],
    notes: '',
    create_meet: false,
    booking_event_type_id: undefined,
  });

  const [startDate, setStartDate] = useState<Date | undefined>(defaultDate || new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(defaultDate || new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // Lead search combobox + create-new
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '' });

  useEffect(() => {
    if (event) {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const meta = (event as any).metadata || {};
      setFormData({
        title: event.title,
        description: event.description || '',
        location: event.location || '',
        event_type: event.event_type,
        start_time: event.start_time,
        end_time: event.end_time,
        all_day: event.all_day,
        lead_id: event.lead_id || undefined,
        product_id: event.product_id || undefined,
        reminder_minutes: event.reminder_minutes || [15, 60],
        notes: event.notes || '',
        create_meet: event.create_meet || false,
        booking_event_type_id: meta.booking_event_type_id || undefined,
      });
      setStartDate(start);
      setEndDate(end);
      setStartTime(format(start, 'HH:mm'));
      setEndTime(format(end, 'HH:mm'));
    } else {
      const date = defaultDate || new Date();
      setStartDate(date);
      setEndDate(date);
      setFormData(prev => ({
        ...prev,
        title: '',
        description: '',
        location: '',
        event_type: 'meeting',
        all_day: false,
        lead_id: defaultLeadId || undefined,
        product_id: defaultProductId || undefined,
        reminder_minutes: [15, 60],
        notes: '',
        create_meet: false,
        booking_event_type_id: undefined,
      }));
    }
  }, [event, defaultDate, defaultLeadId, defaultProductId, open]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const all = leads || [];
    if (!q) return all.slice(0, 50);
    return all.filter((l: any) => {
      const name = (l.name || '').toLowerCase();
      const email = (l.email || '').toLowerCase();
      const phone = String(l.phone || '') + String(l.phone_normalized || '');
      return name.includes(q) || email.includes(q) || phone.includes(q.replace(/\D/g, ''));
    }).slice(0, 50);
  }, [leads, leadSearch]);

  const selectedLead = useMemo(
    () => (leads || []).find((l: any) => l.id === formData.lead_id),
    [leads, formData.lead_id]
  );

  const handleApplyEventType = (id: string) => {
    if (id === 'none') {
      setFormData(prev => ({ ...prev, booking_event_type_id: undefined }));
      return;
    }
    const et = (bookingEventTypes || []).find((e: any) => e.id === id);
    if (!et) return;
    setFormData(prev => ({
      ...prev,
      booking_event_type_id: id,
      title: prev.title || et.name,
      create_meet: !!et.create_meet,
      location: et.create_meet ? '' : (et.location_details || prev.location),
    }));
    // Adjust end time based on duration
    if (startDate && et.duration_minutes) {
      const [sh, sm] = startTime.split(':').map(Number);
      const s = new Date(startDate);
      s.setHours(sh, sm, 0, 0);
      const e = new Date(s.getTime() + et.duration_minutes * 60_000);
      setEndDate(e);
      setEndTime(format(e, 'HH:mm'));
    }
  };

  const handleCreateNewLead = async () => {
    if (!newLead.name.trim() || !newLead.phone.trim()) {
      toast({ title: 'Preencha nome e WhatsApp', variant: 'destructive' });
      return;
    }
    if (!profile?.organization_id || !user?.id) return;
    try {
      const lead = await createLead.mutateAsync({
        name: newLead.name.trim(),
        phone: newLead.phone.trim(),
        email: newLead.email.trim() || null,
        organization_id: profile.organization_id,
        assigned_to: user.id,
        source: 'manual_calendar',
        lead_origin: 'manual_calendar',
      } as any);
      await refetchLeads();
      setFormData(prev => ({ ...prev, lead_id: lead.id }));
      setCreateLeadOpen(false);
      setNewLead({ name: '', phone: '', email: '' });
      toast({ title: 'Lead criado e vinculado' });
    } catch (e: any) {
      toast({ title: 'Erro ao criar lead', description: e.message, variant: 'destructive' });
    }
  };

  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!startDate || !endDate || !formData.title) return;
    submittingRef.current = true;
    try {

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startDateTime = new Date(startDate);
    startDateTime.setHours(startHour, startMin, 0, 0);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(endHour, endMin, 0, 0);

    const { booking_event_type_id, ...rest } = formData;
    const eventData: CreateEventData = {
      ...rest,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      ...(booking_event_type_id ? { metadata: { booking_event_type_id } } as any : {}),
    };

    let savedId: string | undefined;
    if (event) {
      const updated = await updateEvent.mutateAsync({ id: event.id, ...eventData });
      savedId = updated?.id || event.id;
    } else {
      const created = await createEvent.mutateAsync(eventData);
      savedId = created?.id;
    }

    // If a booking event type was chosen and a lead is linked, fire automation
    if (savedId && booking_event_type_id && formData.lead_id) {
      try {
        const { error } = await supabase.functions.invoke('manual-booking-create', {
          body: {
            calendarEventId: savedId,
            eventTypeId: booking_event_type_id,
            leadId: formData.lead_id,
          },
        });
        if (error) {
          toast({
            title: 'Evento criado, mas falhou ao agendar notificações',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Confirmação e lembretes agendados' });
        }
      } catch (e: any) {
        toast({
          title: 'Evento criado, mas falhou ao agendar notificações',
          description: e.message,
          variant: 'destructive',
        });
      }
    }

      onOpenChange(false);
      resetForm();
    } finally {
      submittingRef.current = false;
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      location: '',
      event_type: 'meeting',
      start_time: '',
      end_time: '',
      all_day: false,
      lead_id: undefined,
      product_id: undefined,
      reminder_minutes: [15, 60],
      notes: '',
      create_meet: false,
      booking_event_type_id: undefined,
    });
    setStartDate(new Date());
    setEndDate(new Date());
    setStartTime('09:00');
    setEndTime('10:00');
    setLeadSearch('');
  };

  const toggleReminder = (minutes: number) => {
    const current = formData.reminder_minutes || [];
    if (current.includes(minutes)) {
      setFormData({ ...formData, reminder_minutes: current.filter(m => m !== minutes) });
    } else {
      setFormData({ ...formData, reminder_minutes: [...current, minutes] });
    }
  };

  const isLoading = createEvent.isPending || updateEvent.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {event ? 'Editar Evento' : 'Novo Evento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Ex: Reunião com cliente"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          {/* Booking Event Type (with notifications) */}
          {(bookingEventTypes && bookingEventTypes.length > 0) && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Tipo configurado (envia confirmação + lembretes)
              </Label>
              <Select
                value={formData.booking_event_type_id || 'none'}
                onValueChange={handleApplyEventType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tipo configurado..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (evento simples)</SelectItem>
                  {bookingEventTypes.map((et: any) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.name} · {et.duration_minutes}min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.booking_event_type_id && (
                <p className="text-xs text-muted-foreground">
                  Vincule um lead abaixo para que a confirmação e os lembretes sejam enviados.
                </p>
              )}
            </div>
          )}

          {/* Event Type */}
          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={formData.event_type === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, event_type: type.value })}
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP', { locale: ptBR }) : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hora Início</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={formData.all_day}
              />
            </div>

            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP', { locale: ptBR }) : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hora Fim</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={formData.all_day}
              />
            </div>
          </div>

          {/* All Day */}
          <div className="flex items-center gap-2">
            <Switch
              id="all_day"
              checked={formData.all_day}
              onCheckedChange={(checked) => setFormData({ ...formData, all_day: checked })}
            />
            <Label htmlFor="all_day">Dia inteiro</Label>
          </div>

          {/* Links Section */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Vínculos
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lead</Label>
                <Popover open={leadOpen} onOpenChange={setLeadOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedLead ? (selectedLead as any).name : 'Nenhum'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar por nome, telefone ou email..."
                        value={leadSearch}
                        onValueChange={setLeadSearch}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setLeadOpen(false);
                              setCreateLeadOpen(true);
                            }}
                            className="text-primary font-medium"
                          >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Criar novo lead
                          </CommandItem>
                          <CommandItem
                            onSelect={() => {
                              setFormData(prev => ({ ...prev, lead_id: undefined }));
                              setLeadOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', !formData.lead_id ? 'opacity-100' : 'opacity-0')} />
                            Nenhum
                          </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                          {filteredLeads.map((lead: any) => (
                            <CommandItem
                              key={lead.id}
                              onSelect={() => {
                                setFormData(prev => ({ ...prev, lead_id: lead.id }));
                                setLeadOpen(false);
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', formData.lead_id === lead.id ? 'opacity-100' : 'opacity-0')} />
                              <div className="flex flex-col">
                                <span className="text-sm">{lead.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {lead.phone || lead.email || '—'}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={formData.product_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, product_id: value === 'none' ? undefined : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">
              <MapPin className="h-4 w-4 inline mr-1" />
              Local / Link da reunião
            </Label>
            <Input
              id="location"
              placeholder="https://meet.google.com/... ou endereço"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              disabled={formData.create_meet}
            />
            {formData.create_meet && (
              <p className="text-xs text-muted-foreground">
                Um link do Google Meet será gerado automaticamente ao sincronizar
              </p>
            )}
          </div>

          {/* Google Meet Toggle */}
          {isConnected && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <Video className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <Label htmlFor="create_meet" className="text-sm font-medium">
                  Criar Google Meet
                </Label>
                <p className="text-xs text-muted-foreground">
                  Gera automaticamente um link de reunião ao sincronizar
                </p>
              </div>
              <Switch
                id="create_meet"
                checked={formData.create_meet}
                onCheckedChange={(checked) => setFormData({ ...formData, create_meet: checked, location: checked ? '' : formData.location })}
              />
            </div>
          )}

          {event?.meet_link && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <Video className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Link do Google Meet</p>
                <a
                  href={event.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:underline break-all"
                >
                  {event.meet_link}
                </a>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => window.open(event.meet_link!, '_blank')}>
                Entrar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Detalhes do evento..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Reminders */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Lembretes (próprios)
            </h4>
            <div className="space-y-2">
              {REMINDER_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`reminder-${option.value}`}
                    checked={formData.reminder_minutes?.includes(option.value)}
                    onCheckedChange={() => toggleReminder(option.value)}
                  />
                  <Label htmlFor={`reminder-${option.value}`} className="text-sm font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.title || isLoading} className="flex-1">
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {event ? 'Salvando alterações...' : 'Criando evento...'}</>
              ) : event ? 'Salvar Alterações' : 'Criar Evento'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Create-new-lead sub-dialog */}
      <Dialog open={createLeadOpen} onOpenChange={setCreateLeadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Criar novo lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={newLead.name}
                onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp *</Label>
              <Input
                value={newLead.phone}
                onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
              <p className="text-xs text-muted-foreground">
                Será normalizado para DDI 55 automaticamente.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newLead.email}
                onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateLeadOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleCreateNewLead} disabled={createLead.isPending}>
                {createLead.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</>
                ) : 'Criar e vincular'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
