// Process media (audio / image) coming from a conversational channel
// (today: WhatsApp via Evolution Go).
//
// Input options (POST JSON):
//   { kind: "audio" | "image", base64: "<raw base64>", mime?: string, caption?: string }
//   { kind: "audio" | "image", url: "https://...", mime?: string, caption?: string }
//
// Output:
//   { success: true, text: string, kind, model_used }
//
// Audio  -> OpenAI Whisper (whisper-1) -> transcription text
// Image  -> OpenAI gpt-4o-mini (Vision) -> short, factual description
// Both use OPENAI_API_KEY (centralizado em uma única chave da organização).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  // Accepts data URLs and raw base64.
  const cleaned = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Inspect the first bytes of a binary buffer to detect the real container format.
// WhatsApp / Evolution often delivers the wrong mime (e.g. "audio/ogg" for an
// OGG-Opus blob, or "image/jpeg" for a WebP/PNG). Whisper and GPT Vision both
// reject unsupported formats with HTTP 400, so we sniff and override.
function sniffFormat(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (!bytes || bytes.length < 12) return null;
  const b = bytes;
  const ascii = (i: number, n: number) =>
    String.fromCharCode(...Array.from(b.subarray(i, i + n)));

  // Images
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return { ext: "gif", mime: "image/gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { ext: "webp", mime: "image/webp" };

  // Audio
  if (ascii(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return { ext: "wav", mime: "audio/wav" };
  if (ascii(0, 4) === "fLaC") return { ext: "flac", mime: "audio/flac" };
  // MP3: ID3 tag or sync frame
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  // M4A / MP4 audio: ...ftyp at offset 4
  if (ascii(4, 4) === "ftyp") return { ext: "m4a", mime: "audio/mp4" };
  // WebM (EBML header)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", mime: "audio/webm" };

  return null;
}

async function fetchAsBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch media url failed: ${r.status}`);
  const mime = r.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { bytes: buf, mime };
}

async function transcribeAudio(
  bytes: Uint8Array,
  mime: string,
  ext: string,
  apiKey: string,
): Promise<string> {
  const fileBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fileBuffer).set(bytes);
  const blob = new Blob([fileBuffer], { type: mime });
  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  fd.append("model", "whisper-1");
  // Português é o idioma esperado da maior parte das mensagens; whisper auto-detecta se vier outro.
  fd.append("language", "pt");
  fd.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`whisper error ${res.status} (mime=${mime}, ext=${ext}, bytes=${bytes.byteLength}, head=${Array.from(bytes.slice(0,8)).map(x=>x.toString(16).padStart(2,'0')).join('')}): ${t.slice(0, 300)}`);
  }
  const text = (await res.text()).trim();
  return text;
}

async function describeImage(
  bytes: Uint8Array,
  mime: string,
  caption: string | undefined,
  apiKey: string,
): Promise<string> {
  // Encode back to base64 for the data URL the Vision API expects.
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const dataUrl = `data:${mime};base64,${b64}`;

  const userContent: any[] = [
    {
      type: "text",
      text:
        "Descreva objetivamente o conteúdo desta imagem em português, " +
        "em no máximo 3 frases. Se for um comprovante (Pix, boleto, cartão), " +
        "extraia valor, data, chave/destino e nome quando possíveis. " +
        "Se for um documento, identifique o tipo. " +
        "Se contiver texto legível, transcreva o trecho mais importante. " +
        "Não invente informações.",
    },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  if (caption && caption.trim()) {
    userContent.push({
      type: "text",
      text: `Legenda enviada pelo cliente junto da imagem: "${caption.trim()}"`,
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é um analisador visual de mensagens de WhatsApp em um CRM de vendas. " +
            "Sua resposta vira o conteúdo textual da mensagem que um agente IA vai ler. " +
            "Seja factual, objetivo e direto.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`vision error ${res.status} (mime=${mime}, bytes=${bytes.byteLength}, head=${Array.from(bytes.slice(0,12)).map(x=>x.toString(16).padStart(2,'0')).join('')}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("vision returned empty");
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || "").toLowerCase();
    if (kind !== "audio" && kind !== "image") {
      return jsonResponse({ success: false, error: "kind must be 'audio' or 'image'" }, 400);
    }

    // Resolve a chave OpenAI da organização (white-label, multi-tenant, sem env global).
    let apiKey = "";
    const orgId: string | undefined = body?.organization_id;
    if (orgId) {
      try {
        const { resolveAIProvider } = await import("../_shared/ai-credentials.ts");
        const cap = kind === "audio" ? "audio_transcription" : "image_vision";
        const resolved = await resolveAIProvider(orgId, cap as any);
        if (resolved.provider === "openai") apiKey = resolved.apiKey;
      } catch (e) {
        console.warn("[process-media-message] resolve org key failed:", e);
      }
    }
    if (!apiKey) return jsonResponse({ success: false, error: "AI_NO_CREDENTIAL: cadastre sua chave OpenAI em Admin → Integrações → OpenAI." }, 400);

    let bytes: Uint8Array | null = null;
    let mime: string = String(body?.mime || "");

    if (typeof body?.base64 === "string" && body.base64.length > 10) {
      bytes = base64ToBytes(body.base64);
      if (!mime) mime = kind === "audio" ? "audio/ogg" : "image/jpeg";
    } else if (typeof body?.url === "string" && body.url.startsWith("http")) {
      const f = await fetchAsBytes(body.url);
      bytes = f.bytes;
      if (!mime) mime = f.mime;
    } else {
      return jsonResponse({ success: false, error: "provide 'base64' or 'url'" }, 400);
    }

    if (!bytes || bytes.byteLength === 0) {
      return jsonResponse({ success: false, error: "empty media" }, 400);
    }
    // Hard cap to keep things sane (25MB Whisper limit, well under for images too).
    if (bytes.byteLength > 24 * 1024 * 1024) {
      return jsonResponse({ success: false, error: "media too large (>24MB)" }, 413);
    }

    // Sniff the real format from the magic bytes — providers often lie about mime.
    const sniffed = sniffFormat(bytes);
    if (sniffed) {
      mime = sniffed.mime;
    } else {
      // GATE: bytes do NOT match any known audio/image container.
      // This usually means the upstream (Evolution Go) failed to decrypt the
      // WhatsApp media and we got the raw encrypted blob. Refuse to forward
      // it to OpenAI — that always returns HTTP 400 and wastes a request.
      const head = Array.from(bytes.slice(0, 12))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      console.error(
        `[process-media-message] unrecognized binary head=${head} bytes=${bytes.byteLength} kind=${kind} — likely still encrypted`,
      );
      return jsonResponse(
        {
          success: false,
          error: "unrecognized_binary",
          detail: `bytes do not match any known ${kind} format (head=${head}); upstream likely failed to decrypt`,
        },
        422,
      );
    }

    if (kind === "audio") {
      // Map mime -> whisper extension
      const ext =
        mime.includes("ogg") ? "ogg" :
        mime.includes("mpeg") || mime.includes("mp3") ? "mp3" :
        mime.includes("wav") ? "wav" :
        mime.includes("webm") ? "webm" :
        mime.includes("flac") ? "flac" :
        mime.includes("mp4") || mime.includes("m4a") ? "m4a" :
        "ogg";
      const finalMime = mime || "audio/ogg";
      const text = await transcribeAudio(bytes, finalMime, ext, apiKey);
      return jsonResponse({
        success: true,
        kind: "audio",
        text: text || "(áudio sem fala detectada)",
        model_used: "whisper-1",
        detected_mime: finalMime,
      });
    } else {
      // Vision only accepts png / jpeg / gif / webp.
      const supported = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!supported.includes(mime)) {
        // Best-effort fallback: assume jpeg. If it's HEIC or something exotic
        // GPT will reject again — but we surface a clearer error.
        mime = "image/jpeg";
      }
      const text = await describeImage(bytes, mime, body?.caption, apiKey);
      return jsonResponse({
        success: true,
        kind: "image",
        text,
        model_used: "gpt-4o-mini",
        detected_mime: mime,
      });
    }
  } catch (e: any) {
    console.error("[process-media-message] error:", e?.message || String(e));
    return jsonResponse({ success: false, error: e?.message || "unknown error" }, 500);
  }
});
