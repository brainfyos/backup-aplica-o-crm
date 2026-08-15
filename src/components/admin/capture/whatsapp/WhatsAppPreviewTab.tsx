import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Phone, Video, MoreVertical, Mic, Smile, Paperclip, AlertCircle } from 'lucide-react';
import { Funnel, FunnelBlock } from '@/types/funnel';

interface Props { funnel: Funnel; }

interface PreviewMsg {
  side: 'bot' | 'user';
  text: string;
  type?: 'message' | 'buttons' | 'input' | 'note';
  options?: string[];
}

/**
 * Renderiza um preview estático do fluxo como se fosse o WhatsApp.
 * Percorre os blocos seguindo `next_block_id` a partir do start_block_id e
 * mostra cada bloco textual como bolha, parando em handoff/ai/end.
 */
function buildPreviewMessages(blocks: FunnelBlock[], startId: string | null): PreviewMsg[] {
  if (!startId || blocks.length === 0) return [];
  const map = new Map(blocks.map(b => [b.id, b]));
  const seen = new Set<string>();
  const out: PreviewMsg[] = [];
  let cur: FunnelBlock | undefined = map.get(startId);
  let safety = 25;
  while (cur && safety-- > 0 && !seen.has(cur.id)) {
    seen.add(cur.id);
    const data = (cur.data as any) || {};
    switch (cur.type) {
      case 'message':
        if (data.content) out.push({ side: 'bot', text: data.content, type: 'message' });
        break;
      case 'buttons':
        if (data.label) out.push({ side: 'bot', text: data.label, type: 'message' });
        out.push({
          side: 'bot',
          text: '',
          type: 'buttons',
          options: (data.options || []).map((o: any) => o.label).slice(0, 5),
        });
        break;
      case 'input':
      case 'quick_form':
        out.push({ side: 'bot', text: data.label || data.prompt || 'Digite sua resposta...', type: 'input' });
        out.push({ side: 'user', text: '_aguardando resposta_', type: 'input' });
        break;
      case 'delay':
        out.push({ side: 'bot', text: `⏱️ ${data.duration || 2}s de pausa`, type: 'note' });
        break;
      case 'ai_takeover':
      case 'ai_decide':
      case 'ai_qualify':
        out.push({
          side: 'bot',
          text: '🤖 IA assume a conversa daqui — o restante depende das respostas do lead.',
          type: 'note',
        });
        return out;
      case 'schedule':
        out.push({ side: 'bot', text: '📅 Oferece horários disponíveis para agendamento', type: 'note' });
        break;
      case 'handoff':
        out.push({ side: 'bot', text: '👤 Transferindo para atendente humano...', type: 'note' });
        return out;
      case 'end':
        out.push({ side: 'bot', text: '✅ Fim do fluxo', type: 'note' });
        return out;
      default:
        out.push({ side: 'bot', text: `[${cur.type}]`, type: 'note' });
    }
    const nextId = (cur.data as any).next_block_id || cur.next_block_id;
    cur = nextId ? map.get(nextId) : undefined;
  }
  return out;
}

export function WhatsAppPreviewTab({ funnel }: Props) {
  const messages = useMemo(
    () => buildPreviewMessages(funnel.flow_blocks || [], funnel.start_block_id),
    [funnel.flow_blocks, funnel.start_block_id]
  );

  const wa = (funnel.channels as any)?.whatsapp;
  const isEnabled = wa?.enabled !== false;

  return (
    <div className="h-full flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between gap-2 pb-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={isEnabled ? 'default' : 'secondary'}>
            {isEnabled ? 'WhatsApp habilitado' : 'Desabilitado — habilite na aba Conexão'}
          </Badge>
          {!isEnabled && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Fluxo não dispara enquanto o canal estiver desabilitado
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Preview estático — gerado a partir do fluxo
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-start justify-center pt-2 pb-6 px-4">
        {/* Mockup WhatsApp */}
        <Card className="w-full max-w-md overflow-hidden shadow-lg">
          {/* Header */}
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-semibold">
              {(funnel.products?.name || 'B').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{funnel.products?.name || 'Atendimento'}</p>
              <p className="text-[11px] opacity-80">online</p>
            </div>
            <Video className="h-5 w-5 opacity-90" />
            <Phone className="h-5 w-5 opacity-90" />
            <MoreVertical className="h-5 w-5 opacity-90" />
          </div>

          {/* Chat area */}
          <div
            className="px-3 py-4 space-y-2 min-h-[480px]"
            style={{
              backgroundColor: '#ECE5DD',
              backgroundImage:
                'radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)',
              backgroundSize: '10px 10px',
            }}
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center px-6">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Adicione blocos no Fluxo para visualizar a conversa aqui.
                </p>
              </div>
            ) : (
              messages.map((m, i) => {
                if (m.type === 'note') {
                  return (
                    <div key={i} className="flex justify-center">
                      <div className="bg-white/80 text-[#075E54] text-[11px] px-3 py-1 rounded-md shadow-sm">
                        {m.text}
                      </div>
                    </div>
                  );
                }
                if (m.type === 'buttons') {
                  return (
                    <div key={i} className="flex flex-col gap-1.5 max-w-[80%]">
                      {m.options?.map((opt, j) => (
                        <div
                          key={j}
                          className="bg-white text-[#075E54] text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm border border-gray-200 text-center"
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  );
                }
                const isUser = m.side === 'user';
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[78%] px-3 py-2 rounded-lg shadow-sm text-sm whitespace-pre-wrap ${
                        isUser
                          ? 'bg-[#DCF8C6] text-gray-900 rounded-tr-none'
                          : 'bg-white text-gray-900 rounded-tl-none'
                      }`}
                    >
                      {m.text}
                      <div className="text-[10px] text-gray-500 text-right mt-0.5">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input bar */}
          <div className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 border-t">
            <Smile className="h-5 w-5 text-gray-500" />
            <Paperclip className="h-5 w-5 text-gray-500" />
            <div className="flex-1 bg-white rounded-full px-3 py-2 text-xs text-gray-400">
              Digite uma mensagem
            </div>
            <div className="w-9 h-9 rounded-full bg-[#075E54] flex items-center justify-center">
              <Mic className="h-4 w-4 text-white" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
