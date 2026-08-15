import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_conversations",
  title: "Listar conversas",
  description:
    "Lista as conversas de atendimento (WhatsApp, webchat, Instagram) visíveis para o usuário conectado, com a última mensagem de cada uma.",
  inputSchema: {
    status: z.enum(["open", "waiting_human", "closed"]).optional().describe("Filtra pelo status da conversa."),
    channel: z.string().trim().optional().describe("Filtra pelo canal (ex.: whatsapp, webchat, instagram)."),
    limit: z.number().int().min(1).max(50).default(20).describe("Quantidade máxima de conversas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, channel, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("webchat_conversations")
      .select(
        "id, channel, status, visitor_name, visitor_phone, visitor_email, lead_id, needs_human, last_message_content, last_message_sender_type, last_message_at, created_at",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);

    if (status) query = query.eq("status", status);
    if (channel) query = query.eq("channel", channel);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { conversations: data ?? [], count: data?.length ?? 0 },
    };
  },
});
