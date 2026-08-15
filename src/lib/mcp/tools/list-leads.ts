import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista os leads visíveis para o usuário conectado, com busca opcional por nome, e-mail, telefone ou empresa.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Texto para buscar em nome, e-mail, telefone ou empresa."),
    temperature: z.enum(["cold", "warm", "hot"]).optional().describe("Filtra pela temperatura do lead."),
    limit: z.number().int().min(1).max(100).default(20).describe("Quantidade máxima de leads retornados."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, temperature, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("leads")
      .select("id, name, email, phone, company, source, temperature, deal_value, next_action, last_contact_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (temperature) query = query.eq("temperature", temperature);
    if (search) {
      const term = `%${search.replace(/[%,]/g, "")}%`;
      query = query.or(
        `name.ilike.${term},email.ilike.${term},phone.ilike.${term},company.ilike.${term}`,
      );
    }

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { leads: data ?? [], count: data?.length ?? 0 },
    };
  },
});
