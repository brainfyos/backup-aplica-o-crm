import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recordLovableUsage } from '../_shared/ai-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateFormRequest {
  product_id: string;
  objective: 'qualification' | 'diagnostic' | 'capture' | 'presale' | 'feedback';
  tone: 'formal' | 'informal' | 'technical';
  num_questions: number;
  form_name?: string;
  // New fields for enhanced generation
  user_context?: string;
  use_brain?: boolean;
  use_objections?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      product_id, 
      objective, 
      tone, 
      num_questions, 
      form_name,
      user_context = '',
      use_brain = true,
      use_objections = true
    } = await req.json() as GenerateFormRequest;

    console.log('Generating form for product:', product_id, 'objective:', objective, 'with brain:', use_brain, 'with objections:', use_objections);

    // Fetch product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      return new Response(
        JSON.stringify({ error: 'Produto não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build product context (using REAL columns from public.products)
    const pitch = product.pitch_2min || product.pitch_30s || product.pitch_15s || 'N/A';
    const differentials = Array.isArray(product.differentials)
      ? product.differentials.filter(Boolean).join(', ')
      : (product.differentials || 'N/A');
    const problemsSolved = [product.benefits, product.objections].filter(Boolean).join('\n') || 'N/A';

    let productContext = `
Produto: ${product.name}
Descrição curta: ${product.short_description || 'N/A'}
Descrição: ${product.description || 'N/A'}
Pitch: ${pitch}
ICP (Cliente Ideal): ${product.icp || 'N/A'}
Diferenciais: ${differentials}
Benefícios / Problemas que resolve: ${problemsSolved}
Planos: ${product.plans || 'N/A'}
Garantia: ${product.guarantee || 'N/A'}
`;

    // Fetch knowledge sources for context (if use_brain is true)
    let knowledgeContext = '';
    if (use_brain) {
      const { data: knowledgeSources } = await supabase
        .from('product_knowledge_sources')
        .select('title, source_type, extracted_content, question, answer')
        .eq('product_id', product_id)
        .eq('status', 'processed')
        .eq('is_active', true)
        .limit(10);

      if (knowledgeSources && knowledgeSources.length > 0) {
        knowledgeContext = knowledgeSources.map(ks => {
          if (ks.source_type === 'faq' && ks.question && ks.answer) {
            return `FAQ - ${ks.question}: ${ks.answer}`;
          }
          return `${ks.title} (${ks.source_type}): ${ks.extracted_content?.substring(0, 800) || ''}`;
        }).join('\n\n');
      }

      // Fetch agent training materials
      const { data: trainingMaterials } = await supabase
        .from('agent_training_materials')
        .select('content')
        .eq('product_id', product_id)
        .limit(5);

      if (trainingMaterials && trainingMaterials.length > 0) {
        knowledgeContext += '\n\nMateriais de Treinamento:\n' + 
          trainingMaterials.map(m => m.content?.substring(0, 500)).join('\n');
      }
    }

    // Fetch objections (if use_objections is true)
    let objectionsContext = '';
    if (use_objections) {
      const { data: objections } = await supabase
        .from('objections')
        .select('category, what_they_say, what_they_mean, suggested_response')
        .eq('product_id', product_id)
        .limit(10);

      if (objections && objections.length > 0) {
        objectionsContext = objections.map(obj => 
          `- Categoria: ${obj.category}\n  O que dizem: "${obj.what_they_say}"\n  O que significa: ${obj.what_they_mean || 'N/A'}`
        ).join('\n\n');
      }
    }

    const objectiveDescriptions = {
      qualification: 'Qualificar leads identificando fit com o produto e maturidade de compra. Crie perguntas que identifiquem se o lead é um ICP qualificado.',
      diagnostic: 'Diagnosticar necessidades e dores do lead para personalizar a abordagem comercial. Foque em entender o cenário atual e desafios.',
      capture: 'Captar informações básicas de contato de forma rápida e não-invasiva. Mantenha o formulário curto e direto.',
      presale: 'Preparar o lead para uma reunião de vendas coletando informações detalhadas sobre expectativas e orçamento.',
      feedback: 'Coletar feedback sobre o produto ou processo de vendas. Use escalas e perguntas abertas.',
    };

    const toneDescriptions = {
      formal: 'Use linguagem formal e profissional, adequada para B2B corporativo. Evite gírias e mantenha tom respeitoso.',
      informal: 'Use linguagem amigável e descontraída, como uma conversa casual. Seja acolhedor e empático.',
      technical: 'Use termos técnicos relevantes ao setor, assumindo conhecimento prévio. Seja preciso e objetivo.',
    };

    // Build enhanced system prompt
    const systemPrompt = `Você é um especialista em criação de formulários de captação de leads para vendas B2B.
Seu objetivo é gerar um formulário otimizado para conversão, baseado no contexto completo do produto e da campanha.

CONTEXTO DO PRODUTO:
${productContext}

${knowledgeContext ? `CONHECIMENTO DO CÉREBRO DO PRODUTO (Fontes Processadas):
${knowledgeContext}

` : ''}${objectionsContext ? `OBJEÇÕES COMUNS DOS CLIENTES (Use para criar perguntas de qualificação):
${objectionsContext}

` : ''}${user_context ? `CONTEXTO ESPECÍFICO DA CAMPANHA (Fornecido pelo usuário — PRIORIDADE MÁXIMA):
${user_context}

⚠️ ATENÇÃO: As perguntas DEVEM refletir explicitamente o contexto acima. Se o usuário citou nicho, campanha (ex: Black Friday), ICP específico, setor, evento ou objeção concreta, as perguntas precisam abordar isso diretamente. Não gere um formulário genérico.

` : ''}OBJETIVO DO FORMULÁRIO: ${objectiveDescriptions[objective]}

TOM DE COMUNICAÇÃO: ${toneDescriptions[tone]}

REGRAS IMPORTANTES:
1. Crie perguntas claras e objetivas que qualifiquem o lead
2. Use a linguagem adequada ao tom solicitado
3. ${use_objections && objectionsContext ? 'Use as objeções para criar perguntas inteligentes de qualificação (ex: se objeção é preço, pergunte sobre orçamento disponível)' : 'Inclua perguntas que ajudem a entender o perfil do lead'}
4. ${use_brain && knowledgeContext ? 'Baseie as perguntas no conhecimento real do produto e seus diferenciais' : 'Foque nas necessidades típicas do ICP descrito'}
5. ${user_context ? 'Personalize as perguntas para o contexto da campanha descrito acima — não ignore esse contexto' : 'Foque em capturar dados que ajudem o time de vendas'}
6. Limite ao número de perguntas solicitado (${num_questions} perguntas + telas de boas-vindas e agradecimento)
7. Retorne APENAS um JSON válido, sem explicações ou markdown

TIPOS DE BLOCOS VÁLIDOS (use APENAS estes valores em block_type):
- welcome_screen: Tela de boas-vindas (SEMPRE o primeiro bloco)
- text: Pergunta de texto curto. Para nome/empresa/cargo, use "text" com maps_to apropriado ("name", "company")
- textarea: Texto longo (descrição, dor, expectativa)
- email: Email (use maps_to: "email")
- phone: Telefone/WhatsApp (use maps_to: "phone")
- number: Número
- select: Seleção única (inclua "options" como array de {label, value})
- multi_select: Seleção múltipla (inclua "options" como array de {label, value})
- yes_no: Sim/Não
- scale: Escala numérica — IMPORTANTE: coloque a configuração em "options" como objeto {"min":1,"max":10,"min_label":"...","max_label":"..."}
- end_screen: Tela final/agradecimento (SEMPRE o último bloco)

NÃO use "name", "company" ou "thank_you_screen" como block_type — esses valores são inválidos.

FORMATO DE RESPOSTA (JSON ARRAY puro, sem markdown):
[
  {"block_type":"welcome_screen","label":"Título acolhedor","description":"Subtítulo"},
  {"block_type":"text","label":"Qual seu nome?","placeholder":"Seu nome","required":true,"maps_to":"name"},
  {"block_type":"text","label":"Empresa?","required":true,"maps_to":"company"},
  {"block_type":"select","label":"Principal desafio?","options":[{"label":"Opção A","value":"a"},{"label":"Opção B","value":"b"}],"required":true},
  {"block_type":"scale","label":"De 1 a 10, urgência?","options":{"min":1,"max":10,"min_label":"Pode esperar","max_label":"Urgente"},"required":true},
  {"block_type":"email","label":"Seu melhor email?","required":true,"maps_to":"email"},
  {"block_type":"end_screen","label":"Obrigado!","description":"Entraremos em contato."}
]

IMPORTANTE: O array deve conter exatamente ${num_questions} blocos de pergunta + welcome_screen + end_screen (total: ${num_questions + 2} blocos).`;

    const userPrompt = `Gere o formulário de ${num_questions} perguntas seguindo as instruções acima. Retorne APENAS o JSON array, sem explicações ou código markdown.`;

    console.log('Calling AI to generate form with enriched context...');

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar formulário com IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    await recordLovableUsage(supabase, product?.organization_id, 'content_generation', 'google/gemini-2.5-flash', aiData?.usage, 'form-generate-ai');
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log('AI response received, parsing...');

    // Parse the JSON response (robust)
    let blocks;
    try {
      let cleanContent = (aiContent || '').trim();
      // strip markdown fences
      cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      // extract first [ ... last ]
      const start = cleanContent.indexOf('[');
      const end = cleanContent.lastIndexOf(']');
      if (start !== -1 && end !== -1 && end > start) {
        cleanContent = cleanContent.slice(start, end + 1);
      }
      try {
        blocks = JSON.parse(cleanContent);
      } catch {
        // remove trailing commas and retry
        const repaired = cleanContent.replace(/,\s*([}\]])/g, '$1');
        blocks = JSON.parse(repaired);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      return new Response(
        JSON.stringify({ error: 'Erro ao processar resposta da IA', raw: aiContent }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'IA não retornou blocos válidos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Normalize/validate blocks — map deprecated AI outputs to valid types.
    const VALID_TYPES = new Set([
      'text','email','phone','number','textarea','select','multi_select','yes_no','scale',
      'conditional','score','tag','hidden_field','ai_question','ai_followup','welcome_screen','end_screen'
    ]);
    const enhancedBlocks = blocks.map((block: any, index: number) => {
      let type = String(block.block_type || 'text');
      let maps_to = block.maps_to || null;

      // Backwards-compat: AI may return name/company/thank_you_screen
      if (type === 'name') { type = 'text'; maps_to = maps_to || 'name'; }
      else if (type === 'company') { type = 'text'; maps_to = maps_to || 'company'; }
      else if (type === 'thank_you_screen' || type === 'thanks' || type === 'end') { type = 'end_screen'; }
      else if (type === 'welcome' || type === 'intro') { type = 'welcome_screen'; }

      if (!VALID_TYPES.has(type)) type = 'text';

      // scale_options -> options (engine reads block.options for scale config)
      let options = block.options ?? null;
      if (type === 'scale' && block.scale_options && !options) {
        options = block.scale_options;
      }

      return {
        id: crypto.randomUUID(),
        form_id: '',
        block_type: type,
        label: block.label || 'Pergunta',
        description: block.description || null,
        placeholder: block.placeholder || null,
        required: block.required !== false,
        options,
        maps_to,
        order_index: index,
        score_value: null,
        logic_rules: null,
        validation: null,
        block_settings: null,
      };
    });

    console.log('Generated', enhancedBlocks.length, 'blocks successfully');

    // Generate suggested form name based on context
    const objectiveNames = {
      qualification: 'Qualificação',
      diagnostic: 'Diagnóstico',
      capture: 'Captação',
      presale: 'Pré-venda',
      feedback: 'Feedback',
    };

    const suggestedName = form_name || `${product.name} - ${objectiveNames[objective]}`;

    return new Response(
      JSON.stringify({
        success: true,
        blocks: enhancedBlocks,
        suggested_name: suggestedName,
        product_name: product.name,
        context_used: {
          brain: use_brain && !!knowledgeContext,
          objections: use_objections && !!objectionsContext,
          user_context: !!user_context,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in form-generate-ai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
