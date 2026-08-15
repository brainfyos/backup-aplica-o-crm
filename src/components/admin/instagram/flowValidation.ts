import type { IGFlowBlock, IGTriggerType } from '@/hooks/useInstagramFlows';

export type InstagramFlowIssueSeverity = 'error' | 'warning';

export interface InstagramFlowIssue {
  code: string;
  message: string;
  severity: InstagramFlowIssueSeverity;
  blockId?: string;
}

export interface InstagramFlowValidationInput {
  triggerType: IGTriggerType;
  connectionId: string | null;
  connectionStatus?: string | null;
  blocks: IGFlowBlock[];
  startBlockId: string | null;
}

const COMMENT_ONLY_BLOCKS = new Set(['ig_reply_comment', 'ig_private_reply', 'ig_like_comment']);
const TEXT_BLOCKS = new Set(['ig_reply_comment', 'ig_private_reply', 'ig_send_dm', 'message', 'text']);

function textOf(block: IGFlowBlock): string {
  return String(block.data?.text ?? block.data?.content ?? '').trim();
}

function outboundDm(block: IGFlowBlock): boolean {
  return ['ig_private_reply', 'ig_send_dm', 'message', 'text'].includes(block.type);
}

export function validateInstagramFlowForPublish(input: InstagramFlowValidationInput): InstagramFlowIssue[] {
  const issues: InstagramFlowIssue[] = [];
  const { blocks, triggerType } = input;

  if (!input.connectionId) {
    issues.push({
      code: 'connection_required',
      severity: 'error',
      message: 'Escolha qual conta do Instagram executará esta automação.',
    });
  } else if (input.connectionStatus && !['active', 'partial'].includes(input.connectionStatus)) {
    issues.push({
      code: 'connection_inactive',
      severity: 'error',
      message: 'A conta escolhida não está ativa. Reconecte-a antes de publicar.',
    });
  } else if (input.connectionStatus === 'partial') {
    issues.push({
      code: 'connection_partial',
      severity: 'warning',
      message: 'A conta está conectada parcialmente. Algumas ações podem depender de permissões adicionais.',
    });
  }

  if (blocks.length === 0) {
    issues.push({
      code: 'empty_flow',
      severity: 'error',
      message: 'Adicione ao menos um bloco ao fluxo.',
    });
    return issues;
  }

  const ids = new Set(blocks.map((block) => block.id));
  if (!input.startBlockId || !ids.has(input.startBlockId)) {
    issues.push({
      code: 'invalid_start',
      severity: 'error',
      message: 'O bloco inicial do fluxo não está definido.',
    });
  }

  for (const block of blocks) {
    if (TEXT_BLOCKS.has(block.type) && !textOf(block)) {
      issues.push({
        code: 'message_text_required',
        severity: 'error',
        blockId: block.id,
        message: 'Preencha o texto de todos os blocos de mensagem.',
      });
    }

    if (block.type === 'ai_takeover' && !String(block.data?.agent_id ?? '').trim()) {
      issues.push({
        code: 'agent_required',
        severity: 'error',
        blockId: block.id,
        message: 'Escolha qual agente de IA do Vendus assumirá a conversa.',
      });
    }

    if (block.type === 'ig_reply_comment') {
      const variations = Array.isArray(block.data?.variations) ? block.data.variations : [];
      if (variations.some((variation) => !String(variation ?? '').trim())) {
        issues.push({
          code: 'empty_reply_variation',
          severity: 'error',
          blockId: block.id,
          message: 'Remova ou preencha todas as variações da resposta pública.',
        });
      }
      if (variations.length > 9) {
        issues.push({
          code: 'too_many_reply_variations',
          severity: 'error',
          blockId: block.id,
          message: 'Use no máximo 10 respostas contando a principal.',
        });
      }
    }

    if (block.next_block_id && !ids.has(block.next_block_id)) {
      issues.push({
        code: 'broken_link',
        severity: 'error',
        blockId: block.id,
        message: 'Existe uma conexão entre blocos apontando para uma etapa que não existe.',
      });
    }

    const quickReplies = Array.isArray(block.data?.quick_replies) ? block.data.quick_replies : [];
    const buttons = Array.isArray(block.data?.buttons) ? block.data.buttons : [];
    if (quickReplies.length > 0 && buttons.length > 0) {
      issues.push({
        code: 'mixed_ctas',
        severity: 'error',
        blockId: block.id,
        message: 'Use botões ou respostas rápidas na mesma mensagem, nunca os dois juntos.',
      });
    }
    if (buttons.length > 3) {
      issues.push({
        code: 'too_many_buttons',
        severity: 'error',
        blockId: block.id,
        message: 'Uma mensagem do Instagram aceita no máximo 3 botões.',
      });
    }
    if (quickReplies.length > 13) {
      issues.push({
        code: 'too_many_quick_replies',
        severity: 'error',
        blockId: block.id,
        message: 'Uma mensagem do Instagram aceita no máximo 13 respostas rápidas.',
      });
    }
    if (quickReplies.some((reply) =>
      !String(reply?.title ?? reply?.label ?? '').trim()
      || !String(reply?.payload ?? '').trim()
    )) {
      issues.push({
        code: 'invalid_quick_reply',
        severity: 'error',
        blockId: block.id,
        message: 'Toda resposta rápida precisa de texto e identificação.',
      });
    }
    for (const button of buttons) {
      const title = String(button?.title ?? button?.label ?? '').trim();
      const url = String(button?.url ?? '').trim();
      if (!title || !url || !/^https:\/\//i.test(url)) {
        issues.push({
          code: 'invalid_button',
          severity: 'error',
          blockId: block.id,
          message: 'Todo botão precisa de um título e uma URL HTTPS válida.',
        });
        break;
      }
    }
  }

  if (triggerType !== 'comment_keyword') {
    const incompatible = blocks.find((block) => COMMENT_ONLY_BLOCKS.has(block.type));
    if (incompatible) {
      issues.push({
        code: 'comment_action_without_comment_trigger',
        severity: 'error',
        blockId: incompatible.id,
        message: 'Ações de comentário exigem o gatilho “Palavra-chave em comentário”.',
      });
    }
  }

  if (triggerType === 'comment_keyword') {
    const privateReplies = blocks.filter((block) => block.type === 'ig_private_reply');
    if (privateReplies.length > 1) {
      issues.push({
        code: 'multiple_private_replies',
        severity: 'error',
        message: 'A Meta permite somente uma Opening DM privada por comentário.',
      });
    }

    const openingIndex = blocks.findIndex((block) => block.type === 'ig_private_reply');
    const opening = openingIndex >= 0 ? blocks[openingIndex] : null;
    const quickReplies = Array.isArray(opening?.data?.quick_replies) ? opening.data.quick_replies : [];
    const hasContinuationButton = quickReplies.some((reply) =>
      String(reply?.title ?? reply?.label ?? '').trim()
      && String(reply?.payload ?? '').trim(),
    );
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (!['ig_send_dm', 'message', 'text'].includes(block.type)) continue;
      if (!opening || index <= openingIndex) {
        issues.push({
          code: 'followup_before_optin',
          severity: 'error',
          blockId: block.id,
          message: 'A mensagem de continuação precisa ficar depois da Opening DM.',
        });
      } else if (!hasContinuationButton) {
        issues.push({
          code: 'continuation_button_required',
          severity: 'error',
          blockId: opening.id,
          message: 'Adicione um botão de confirmação na Opening DM para liberar as próximas mensagens.',
        });
      }
    }

    const outboundCount = blocks.filter(outboundDm).length;
    if (outboundCount === 0) {
      issues.push({
        code: 'missing_opening_dm',
        severity: 'warning',
        message: 'Este fluxo não possui Opening DM; ele só executará ações públicas ou internas.',
      });
    }
  }

  return issues;
}

export function firstPublishError(issues: InstagramFlowIssue[]): InstagramFlowIssue | undefined {
  return issues.find((issue) => issue.severity === 'error');
}
