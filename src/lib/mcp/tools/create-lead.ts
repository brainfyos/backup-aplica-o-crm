import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_lead",
  title: "Criar lead",
  description:
    "Cria um novo lead na empresa do usuário conectado, já atribuído a ele. Use quando um novo contato precisa entrar no CRM.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Nome do lead."),
    email: z.string().trim().email().optional().describe("E-mail do lead."),
    phone: z.string().trim().min(8).optional().describe("Telefone com DDD (o DDI 55 é aplicado se ausente)."),
    company: z.string().trim().optional().describe("Empresa do lead."),
    source: z.string().trim().optional().describe("Origem do lead (ex.: indicação, evento)."),
    notes: z.string().trim().optional().describe("Observações iniciais."),
    temperature: z.enum(["cold", "warm", "hot"]).optional().describe("Temperatura inicial do lead."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const userId = ctx.getUserId();
    const supabase = supabaseForUser(ctx);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) return { content: [{ type: "text", text: profileError.message }], isError: true };
    if (!profile?.organization_id) {
      return { content: [{ type: "text", text: "Usuário sem empresa vinculada." }], isError: true };
    }

    let phone = input.phone?.replace(/\D/g, "");
    if (phone && !phone.startsWith("55")) phone = `55${phone}`;

    const { data, error } = await supabase
      .from("leads")
      .insert({
        organization_id: profile.organization_id,
        assigned_to: userId,
        name: input.name,
        email: input.email ?? null,
        phone: phone ?? null,
        company: input.company ?? null,
        source: input.source ?? "mcp",
        notes: input.notes ?? null,
        temperature: input.temperature ?? "cold",
      })
      .select("id, name, email, phone, company, temperature")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Lead criado: ${data.name} (${data.id})` }],
      structuredContent: { lead: data },
    };
  },
});
