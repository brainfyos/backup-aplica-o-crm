import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_lead",
  title: "Detalhar lead",
  description:
    "Retorna os dados completos de um lead (qualificação BANT, origem/UTMs, valor e próxima ação) e suas tarefas abertas.",
  inputSchema: {
    lead_id: z.string().uuid().describe("ID do lead."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data: lead, error } = await supabase
      .from("leads")
      .select(
        "id, name, email, phone, company, position, source, lead_origin, lead_channel, temperature, deal_value, expected_close_date, next_action, notes, last_contact_at, bant_budget, bant_authority, bant_need, bant_timing, utm_source, utm_medium, utm_campaign, tags, created_at",
      )
      .eq("id", lead_id)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!lead) return { content: [{ type: "text", text: "Lead não encontrado ou sem acesso." }], isError: true };

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, type")
      .eq("lead_id", lead_id)
      .neq("status", "completed")
      .order("due_date", { ascending: true })
      .limit(20);

    const payload = { lead, open_tasks: tasks ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
