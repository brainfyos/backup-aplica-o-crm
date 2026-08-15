import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Criar tarefa",
  description: "Cria uma tarefa de follow-up para o usuário conectado, opcionalmente vinculada a um lead.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Título da tarefa."),
    description: z.string().trim().optional().describe("Detalhes da tarefa."),
    lead_id: z.string().uuid().optional().describe("Lead relacionado."),
    due_date: z.string().datetime().optional().describe("Vencimento em ISO 8601 (ex.: 2026-08-10T14:00:00Z)."),
    priority: z.enum(["low", "medium", "high"]).default("medium").describe("Prioridade da tarefa."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const userId = ctx.getUserId();
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        created_by: userId,
        lead_id: input.lead_id ?? null,
        title: input.title,
        description: input.description ?? null,
        due_date: input.due_date ?? null,
        priority: input.priority ?? "medium",
        status: "pending",
      })
      .select("id, title, status, priority, due_date, lead_id")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Tarefa criada: ${data.title} (${data.id})` }],
      structuredContent: { task: data },
    };
  },
});
