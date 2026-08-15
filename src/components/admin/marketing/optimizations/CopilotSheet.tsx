import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Send, Loader2, User, Bot } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { askCopilot } from '@/hooks/useMarketingAI';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'O que devo ajustar hoje?',
  'Quais campanhas têm pior custo por resultado?',
  'Quais anúncios mostram sinais de saturação?',
  'Confira se conexão e rastreamento estão saudáveis',
];

interface CopilotSheetProps {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Quando true, não renderiza o botão trigger — o Sheet é controlado por fora. */
  hideTrigger?: boolean;
}

export function CopilotSheet({ open: controlledOpen, onOpenChange, hideTrigger }: CopilotSheetProps = {}) {
  const { profile } = useAuth();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v); else setUncontrolledOpen(v);
  };
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || !profile?.organization_id || loading) return;
    const next: Msg[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await askCopilot(profile.organization_id, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha no copiloto');
      setMessages(next);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Sparkles className="h-4 w-4 mr-2 text-primary" />
            Copiloto
          </Button>
        </SheetTrigger>
      )}

      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Copiloto de Marketing
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1" ref={scrollRef as any}>
          <div className="p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Analiso campanhas, criativos, orçamento e rastreamento usando os dados reais da sua conta.
                </p>
                <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-2">
                  Leitura em tempo real. Toda mudança de gasto ou veiculação exige sua confirmação.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="outline" size="sm" className="h-auto py-1.5 text-xs" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && <Bot className="h-5 w-5 text-primary flex-shrink-0 mt-1" />}
                <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
                {m.role === 'user' && <User className="h-5 w-5 flex-shrink-0 mt-1" />}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analisando…
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Pergunte sobre suas campanhas…"
            disabled={loading}
          />
          <Button size="icon" onClick={() => send(input)} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
