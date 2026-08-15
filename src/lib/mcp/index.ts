import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeadsTool from "./tools/list-leads";
import getLeadTool from "./tools/get-lead";
import createLeadTool from "./tools/create-lead";
import createTaskTool from "./tools/create-task";
import listConversationsTool from "./tools/list-conversations";

// O issuer OAuth precisa ser o host direto do Supabase, montado a partir do
// project ref (inlined pelo Vite em build time — mantém o módulo import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "remix-oficial-vendus-v5",
  title: "Remix Oficial Vendus v5",
  version: "0.1.0",
  instructions:
    "Ferramentas do CRM Vendus. Use `list_leads` e `get_lead` para consultar a carteira, `create_lead` para cadastrar novos contatos, `create_task` para agendar follow-ups e `list_conversations` para ver os atendimentos em andamento. Todas as ações rodam como o usuário conectado e respeitam suas permissões.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeadsTool, getLeadTool, createLeadTool, createTaskTool, listConversationsTool],
});
