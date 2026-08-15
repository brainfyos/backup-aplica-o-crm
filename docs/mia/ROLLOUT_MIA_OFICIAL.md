# Rollout seguro da Mia no projeto oficial

## Objetivo da primeira etapa

Colocar em produção somente a capacidade de leitura e priorização de conversas
abertas, junto do cérebro visual 360°. Ações autônomas, voz global e escrita no
CRM permanecem desligadas até existirem testes e auditoria próprios.

## Ordem obrigatória

1. Executar `npm run audit:remix-db`, `npm run test:mia` e `npm run build`.
2. Revisar a migração `20260810170000_mia_open_conversation_intelligence.sql`.
3. Aplicar a migração no projeto Supabase correto.
4. Publicar `mia-open-conversation-worker` e validar que um JWT de usuário recebe
   `403 service_role_required`.
5. Publicar `mia-open-conversations-report` e validar autenticação/role.
6. Publicar o frontend com `platform_plans.feature_mia` ainda `false`.
7. Cadastrar uma chave OpenAI com finalidade `mia` em **Super Admin > Chaves**.
   Enquanto ela não existir, a Mia usa como fallback a chave OpenAI geral ativa.
8. Ativar um único plano piloto em **Super Admin > Planos** ou via SQL:

   ```sql
   UPDATE public.platform_plans
   SET feature_mia = true
   WHERE id = '<PLAN_ID_DO_PILOTO>';
   ```

9. Rodar uma análise pequena, verificar custo, tempo, isolamento e qualidade das
   evidências antes de ampliar.

## Gates de aceite

- nenhuma tabela ou função existente da Mia é removida;
- todas as três tabelas novas têm RLS habilitada;
- fila e RPC de claim não são executáveis por `anon` ou `authenticated`;
- relatório vazio mostra cobertura `0%`, não `100%`;
- relatório nunca retorna conversas de outra organização;
- cada evidência exibida é substring normalizada da transcrição original;
- conversa alterada após a análise volta a ser considerada pendente;
- falha do provedor gera retry limitado e nunca trava um job para sempre;
- menu da Mia não aparece quando o plano não inclui `feature_mia`;
- abrir uma oportunidade leva ao item correto do Inbox.

## Observabilidade mínima

Durante o piloto, acompanhar:

- `mia_open_report_runs`: duração, processadas, falhas e status parcial;
- `mia_open_conversation_analysis_queue`: retries e `last_error`;
- `ai_usage_logs`: tokens, modelo, fallback e custo por organização;
- cobertura, taxa de evidências válidas e correções manuais da classificação.

## Rollback

O rollback funcional é retirar a Mia do plano, sem apagar dados:

```sql
UPDATE public.platform_plans
SET feature_mia = false
WHERE id = '<PLAN_ID>';
```

Isso esconde o menu e impede novos relatórios/workers. As avaliações e execuções
ficam preservadas para auditoria. Não executar `DROP TABLE` nem remover as Edge
Functions legadas durante o rollback.
