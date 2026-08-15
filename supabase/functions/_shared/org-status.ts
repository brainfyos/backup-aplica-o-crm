// Guard rail: bloqueia operações em empresas suspensas.
export async function assertOrgActive(
  supabase: any,
  organization_id: string | null | undefined,
): Promise<{ ok: true } | { ok: false; status: number; body: { error: string } }> {
  if (!organization_id) return { ok: true };
  const { data, error } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", organization_id)
    .maybeSingle();
  if (error) {
    console.warn("[assertOrgActive] read error:", error);
    return { ok: true }; // não bloqueia em caso de falha de leitura
  }
  if (data && data.status && data.status !== "active") {
    return {
      ok: false,
      status: 403,
      body: { error: "organization_suspended" },
    };
  }
  return { ok: true };
}
