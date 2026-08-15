import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Form, FormBlock, FormTheme, SelectOption, ScaleOptions, FormOptionAction } from '@/types/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { collectTrackingParams } from '@/lib/trackingParams';
import { motion, AnimatePresence } from 'framer-motion';
import { FormBlockMedia } from '@/components/admin/forms/FormBlockMedia';
import { FormThemeWrapper, formButtonProps } from '@/components/admin/forms/FormThemeWrapper';
import { cn } from '@/lib/utils';
import { usePlatformName } from '@/hooks/usePlatformName';

export default function PublicForm() {
  const { slug } = useParams<{ slug: string }>();
  const { platformName, poweredByText } = usePlatformName();
  const [form, setForm] = useState<Form | null>(null);
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepHistory, setStepHistory] = useState<number[]>([]);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (slug) {
      loadForm();
    }
  }, [slug]);

  const loadForm = async () => {
    try {
      setLoading(true);
      
      // Fetch form by slug
      const { data: formData, error: formError } = await supabase
        .from('forms')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (formError || !formData) {
        setError('Formulário não encontrado ou inativo.');
        return;
      }

      // Parse JSONB fields with proper typing
      const theme = formData.theme as unknown as FormTheme | null;
      const settings = formData.settings as unknown as Partial<Form['settings']> | null;
      const roundRobinConfig = formData.round_robin_config as unknown as { users: string[]; current_index: number } | null;
      const customScripts = formData.custom_scripts as unknown as { header: string; footer: string } | null;

      // Salvaguarda: se o fundo é escuro e o texto ficou no default escuro, força branco
      const mergedTheme: FormTheme = {
        primary_color: '#3B82F6',
        secondary_color: '#1E40AF',
        background_color: '#FFFFFF',
        text_color: '#0F172A',
        font_family: 'Inter',
        border_radius: 'lg',
        button_style: 'filled',
        logo_url: null,
        show_progress: true,
        progress_color: null,
        progress_position: 'top',
        layout_type: 'one_per_step',
        redirect_url: null,
        ...(theme || {}),
      };
      const bgHex = (mergedTheme.background_color || '').replace('#', '');
      if (bgHex.length === 6) {
        const r = parseInt(bgHex.slice(0, 2), 16) / 255;
        const g = parseInt(bgHex.slice(2, 4), 16) / 255;
        const b = parseInt(bgHex.slice(4, 6), 16) / 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const txtHex = (mergedTheme.text_color || '').toLowerCase();
        const isDefaultDarkText = txtHex === '#0f172a' || txtHex === '#1f2937' || txtHex === '#000000';
        if (lum < 0.4 && isDefaultDarkText) {
          mergedTheme.text_color = '#FFFFFF';
        }
      }

      const parsedForm: Form = {
        ...formData,
        status: formData.status as Form['status'],
        distribution_rule: formData.distribution_rule as Form['distribution_rule'],
        default_temperature: formData.default_temperature || 'warm',
        theme: mergedTheme,
        settings: {
          ...(settings || {}),
          show_branding: settings?.show_branding ?? true,
          allow_multiple_submissions: settings?.allow_multiple_submissions ?? false,
          notify_on_submission: settings?.notify_on_submission ?? true,
          auto_create_lead: settings?.auto_create_lead ?? true,
          final_block_id: settings?.final_block_id ?? null,
        },
        round_robin_config: roundRobinConfig || { users: [], current_index: 0 },
        custom_scripts: customScripts || { header: '', footer: '' },
        views_count: formData.views_count || 0,
        submissions_count: formData.submissions_count || 0,
      };

      setForm(parsedForm);

      // Fetch blocks
      const { data: blocksData, error: blocksError } = await supabase
        .from('form_blocks')
        .select('*')
        .eq('form_id', formData.id)
        .order('order_index');

      if (blocksError) throw blocksError;

      const parsedBlocks = (blocksData || []).map(block => ({
        ...block,
        block_type: block.block_type as FormBlock['block_type'],
        options: (block.options as unknown as SelectOption[] | ScaleOptions) || [],
        logic_rules: (block.logic_rules as unknown as FormBlock['logic_rules']) || [],
        score_rules: (block.score_rules as unknown as FormBlock['score_rules']) || [],
        apply_tags: block.apply_tags || [],
        validation: (block.validation as unknown as Record<string, unknown>) || {},
        block_settings: (block.block_settings as unknown as Record<string, unknown>) || {},
      })) as FormBlock[];

      setBlocks(parsedBlocks);

      // Increment view count
      await supabase.rpc('increment_form_views', { p_form_id: formData.id });

    } catch (err: any) {
      console.error('Error loading form:', err);
      setError('Erro ao carregar formulário.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Validation helpers ----
  const normalizePhoneDigits = (raw: unknown): string => {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    return d;
  };
  const isValidBRPhone = (raw: unknown): boolean => {
    const d = normalizePhoneDigits(raw);
    return d.length === 10 || d.length === 11;
  };
  const formatBRPhone = (raw: unknown): string => {
    const d = normalizePhoneDigits(raw).slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const isValidEmail = (raw: unknown): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw ?? '').trim());

  // Block types that don't collect a response (no validation)
  const NON_INPUT_BLOCKS = new Set([
    'welcome_screen', 'end_screen', 'statement', 'conditional', 'score', 'tag', 'hidden_field',
  ]);

  const validateBlock = (block: FormBlock | undefined): string | null => {
    if (!block) return null;
    if (NON_INPUT_BLOCKS.has(block.block_type)) return null;
    const v = responses[block.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (block.required && empty) return 'Esta resposta é obrigatória.';
    if (!empty && block.block_type === 'phone' && !isValidBRPhone(v)) {
      return 'WhatsApp inválido. Use DDD + número (ex.: (48) 99652-0589).';
    }
    if (!empty && block.block_type === 'email' && !isValidEmail(v)) {
      return 'E-mail inválido.';
    }
    return null;
  };

  // Collect actions from selected options of a given block based on current responses.
  const getActionsForBlock = (block: FormBlock | undefined): FormOptionAction[] => {
    if (!block) return [];
    if (!['select', 'multi_select'].includes(block.block_type)) return [];
    const opts = (block.options as SelectOption[]) || [];
    const val = responses[block.id];
    const chosenValues = Array.isArray(val) ? val : (val != null && val !== '' ? [val] : []);
    const out: FormOptionAction[] = [];
    for (const v of chosenValues) {
      const opt = opts.find((o) => o.value === v);
      if (!opt?.actions?.length) continue;
      for (const a of opt.actions) {
        if (a.type === 'set_custom_field') {
          const resolved =
            a.value_source === 'static'
              ? a.static_value ?? ''
              : a.value_source === 'option_value'
                ? String(opt.value)
                : (opt.label || String(opt.value));
          out.push({ ...a, _value: resolved });
        } else {
          out.push(a);
        }
      }
    }
    return out;
  };

  // Compute union of actions across all answered blocks (used at submit time).
  const collectAllSelectedActions = (): FormOptionAction[] => {
    const out: FormOptionAction[] = [];
    for (const b of blocks) out.push(...getActionsForBlock(b));
    return out;
  };

  // Build a readable trail of which option in which block was chosen and which
  // actions it triggered. Persisted in the submission + lead interaction so
  // the CRM/webhook knows "lead picked 'Quero agendar' → open_calendar".
  const collectSelectedOptions = () => {
    const out: Array<{
      block_id: string;
      block_label: string;
      option_value: string;
      option_label: string;
      triggered_actions: string[];
    }> = [];
    for (const b of blocks) {
      if (!['select', 'multi_select'].includes(b.block_type)) continue;
      const opts = (b.options as SelectOption[]) || [];
      const val = responses[b.id];
      const chosen = Array.isArray(val) ? val : (val != null && val !== '' ? [val] : []);
      for (const v of chosen) {
        const opt = opts.find((o) => o.value === v);
        if (!opt) continue;
        out.push({
          block_id: b.id,
          block_label: b.label || '',
          option_value: String(opt.value),
          option_label: opt.label || String(opt.value),
          triggered_actions: (opt.actions || []).map((a) => a.type),
        });
      }
    }
    return out;
  };

  const handleNext = () => {
    const err = validateBlock(currentBlock);
    if (err) {
      toast.error(err);
      return;
    }
    // Branching: if current block has a chosen option with go_to_block, jump there.
    const acts = getActionsForBlock(currentBlock);
    const jump = acts.find((a) => a.type === 'go_to_block') as Extract<FormOptionAction, { type: 'go_to_block' }> | undefined;
    if (jump?.target_block_id) {
      const targetIdx = questionBlocks.findIndex((b) => b.id === jump.target_block_id);
      if (targetIdx >= 0) {
        setStepHistory((h) => [...h, currentStep]);
        setCurrentStep(targetIdx);
        return;
      }
    }
    setStepHistory((h) => [...h, currentStep]);
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (stepHistory.length > 0) {
      const prev = stepHistory[stepHistory.length - 1];
      setStepHistory((h) => h.slice(0, -1));
      setCurrentStep(prev);
    } else if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleResponse = (blockId: string, value: unknown) => {
    setResponses(prev => ({ ...prev, [blockId]: value }));
  };

  const handleSubmit = async () => {
    if (!form) return;

    // Validate current block first
    const curErr = validateBlock(currentBlock);
    if (curErr) {
      toast.error(curErr);
      return;
    }

    // Validate all question blocks (required + phone/email format)
    for (const b of questionBlocks) {
      const err = validateBlock(b);
      if (err) {
        toast.error(`${b.label || 'Pergunta'}: ${err}`);
        const idx = questionBlocks.findIndex(x => x.id === b.id);
        if (idx >= 0) setCurrentStep(idx);
        return;
      }
    }

    try {
      setSubmitting(true);

      // Normalize phone responses (digits-only, no DDI 55) before sending
      const cleanResponses: Record<string, unknown> = { ...responses };
      for (const b of blocks) {
        if (b.block_type === 'phone' && cleanResponses[b.id] != null && cleanResponses[b.id] !== '') {
          cleanResponses[b.id] = normalizePhoneDigits(cleanResponses[b.id]);
        }
      }

      // Capture UTM + Meta/Google/TikTok identifiers from URL & cookies
      const tracking = collectTrackingParams();

      const selected_actions = collectAllSelectedActions();
      const selected_options = collectSelectedOptions();

      const { data, error } = await supabase.functions.invoke('form-submit', {
        body: {
          form_id: form.id,
          responses: cleanResponses,
          tracking,
          selected_actions,
          selected_options,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setSubmitted(true);
        // Server may override the theme redirect (e.g. open_calendar action builds a /agendar URL)
        const target: string | null = data.redirect_url || form.theme.redirect_url || null;
        const newTab: boolean = !!data.redirect_new_tab;
        if (target) {
          if (newTab) {
            window.open(target, '_blank', 'noopener');
          } else {
            setTimeout(() => { window.location.href = target; }, 1500);
          }
        }
      } else {
        throw new Error(data?.error || 'Erro ao enviar formulário');
      }
    } catch (err: any) {
      console.error('Error submitting form:', err);
      toast.error(err.message || 'Erro ao enviar formulário');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBlock = (block: FormBlock) => {
    const value = responses[block.id];

    switch (block.block_type) {
      case 'welcome_screen':
        return (
          <div className="text-center space-y-6 flex flex-col items-center">
            {form.theme.logo_url && (
              <img
                src={form.theme.logo_url}
                alt="Logo"
                className={cn(
                  'object-contain mb-2',
                  { sm: 'h-16', md: 'h-24', lg: 'h-32', xl: 'h-40' }[form.theme.logo_size || 'md']
                )}
              />
            )}
            <h1 className="text-3xl md:text-4xl">{block.label}</h1>
            {block.description && (
              <p className="text-lg text-muted-foreground">{block.description}</p>
            )}
            <Button size="lg" onClick={handleNext} variant={btn.variant} className={`gap-2 ${btn.className}`}>
              Começar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        );

      case 'end_screen':
        return (
          <div className="text-center space-y-6">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            <h1 className="text-3xl md:text-4xl">{block.label}</h1>
            {block.description && (
              <p className="text-lg text-muted-foreground">{block.description}</p>
            )}
          </div>
        );

      case 'text':
      case 'email':
      case 'phone': {
        const isPhone = block.block_type === 'phone';
        const displayValue = isPhone
          ? formatBRPhone((value as string) || '')
          : ((value as string) || '');
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Input
              type={block.block_type === 'email' ? 'email' : isPhone ? 'tel' : 'text'}
              inputMode={isPhone ? 'numeric' : undefined}
              placeholder={isPhone ? '(48) 99652-0589' : block.placeholder}
              value={displayValue}
              onChange={(e) => {
                if (isPhone) {
                  // store only digits (without DDI 55)
                  handleResponse(block.id, normalizePhoneDigits(e.target.value));
                } else {
                  handleResponse(block.id, e.target.value);
                }
              }}
              className="text-lg py-6"
            />
          </div>
        );
      }


      case 'number':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Input
              type="number"
              placeholder={block.placeholder}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg py-6"
            />
          </div>
        );

      case 'textarea':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Textarea
              placeholder={block.placeholder}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg min-h-[120px]"
            />
          </div>
        );

      case 'select':
        const selectOptions = block.options as SelectOption[];
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <RadioGroup
              value={(value as string) || ''}
              onValueChange={(v) => handleResponse(block.id, v)}
              className="space-y-3"
            >
              {selectOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleResponse(block.id, option.value)}
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label htmlFor={option.value} className="cursor-pointer flex-1">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 'multi_select':
        const multiOptions = block.options as SelectOption[];
        const selectedValues = (value as string[]) || [];
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <div className="space-y-3">
              {multiOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => {
                    const newValues = selectedValues.includes(option.value)
                      ? selectedValues.filter(v => v !== option.value)
                      : [...selectedValues, option.value];
                    handleResponse(block.id, newValues);
                  }}
                >
                  <Checkbox checked={selectedValues.includes(option.value)} />
                  <Label className="cursor-pointer flex-1">{option.label}</Label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'yes_no':
        return (
          <div className="space-y-4">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <div className="flex gap-4">
              <Button
                variant={value === true ? 'default' : 'outline'}
                size="lg"
                className="flex-1"
                onClick={() => handleResponse(block.id, true)}
              >
                Sim
              </Button>
              <Button
                variant={value === false ? 'default' : 'outline'}
                size="lg"
                className="flex-1"
                onClick={() => handleResponse(block.id, false)}
              >
                Não
              </Button>
            </div>
          </div>
        );

      case 'scale':
        const scaleOptions = block.options as ScaleOptions;
        const sliderValue = (value as number) || scaleOptions.min;
        return (
          <div className="space-y-6">
            <Label className="text-xl font-medium">
              {block.label}
              {block.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <div className="space-y-4">
              <div className="text-center text-4xl font-bold">{sliderValue}</div>
              <Slider
                value={[sliderValue]}
                onValueChange={([v]) => handleResponse(block.id, v)}
                min={scaleOptions.min}
                max={scaleOptions.max}
                step={1}
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{scaleOptions.min_label || scaleOptions.min}</span>
                <span>{scaleOptions.max_label || scaleOptions.max}</span>
              </div>
            </div>
          </div>
        );

      case 'ai_question':
      case 'ai_followup':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <Label className="text-xl font-medium">
                {block.label}
                {block.required && <span className="text-destructive ml-1">*</span>}
              </Label>
            </div>
            {block.description && (
              <p className="text-muted-foreground">{block.description}</p>
            )}
            <Textarea
              placeholder={block.placeholder || 'Digite sua resposta...'}
              value={(value as string) || ''}
              onChange={(e) => handleResponse(block.id, e.target.value)}
              className="text-lg min-h-[120px]"
            />
          </div>
        );

      case 'image':
      case 'video_upload':
      case 'video_embed':
      case 'carousel':
      case 'divider':
        return <FormBlockMedia block={block} />;

      default:
        return null;
    }
  };

  // Filter visible blocks (exclude hidden_field, conditional, score, tag)
  const visibleBlocks = blocks.filter(b => 
    !['hidden_field', 'conditional', 'score', 'tag'].includes(b.block_type)
  );
  
  // Custom final block (settings.final_block_id) is excluded from question flow and rendered on submit
  const rawFinalBlockId = (form?.settings as any)?.final_block_id || null;
  // Validate it still exists in blocks; if not, ignore it
  const customFinalBlock = rawFinalBlockId ? blocks.find(b => b.id === rawFinalBlockId) || null : null;
  const finalBlockId = customFinalBlock?.id || null;

  // Separate question blocks from end_screen — end_screen and custom final block show AFTER submission
  const questionBlocks = visibleBlocks.filter(b => 
    b.block_type !== 'end_screen' && b.id !== finalBlockId
  );
  const hasEndScreen = visibleBlocks.some(b => b.block_type === 'end_screen');

  const currentBlock = questionBlocks[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastQuestionStep = currentStep === questionBlocks.length - 1;
  const isWelcome = currentBlock?.block_type === 'welcome_screen';
  const progress = questionBlocks.length > 0 ? ((currentStep + 1) / questionBlocks.length) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Formulário não encontrado</h2>
            <p className="text-muted-foreground">{error || 'O formulário que você está procurando não existe ou está inativo.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    const finalBtn = formButtonProps(form.theme.button_style);
    const renderCTA = (block: FormBlock | undefined | null) => {
      const settings = (block?.block_settings as any) || {};
      const ctaText = settings.cta_text as string | undefined;
      const redirectUrl = settings.redirect_url as string | undefined;
      if (!redirectUrl && !ctaText) return null;
      if (!redirectUrl) {
        return (
          <Button {...finalBtn} disabled className="mt-2">
            {ctaText || 'Continuar'}
          </Button>
        );
      }
      return (
        <Button {...finalBtn} asChild className={cn(finalBtn.className, 'mt-2')}>
          <a href={redirectUrl} target="_blank" rel="noopener noreferrer">
            {ctaText || 'Continuar'}
          </a>
        </Button>
      );
    };

    // Custom final block takes precedence
    if (customFinalBlock) {
      return (
        <FormThemeWrapper theme={form.theme} className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl"
          >
            {customFinalBlock.block_type === 'image' ||
             customFinalBlock.block_type === 'video_upload' ||
             customFinalBlock.block_type === 'video_embed' ||
             customFinalBlock.block_type === 'carousel' ||
             customFinalBlock.block_type === 'divider' ? (
              <FormBlockMedia block={customFinalBlock} />
            ) : (
              <div className="text-center space-y-4 flex flex-col items-center">
                <h1 className="text-3xl md:text-4xl">{customFinalBlock.label || 'Obrigado!'}</h1>
                {customFinalBlock.description && (
                  <p className="text-lg text-muted-foreground">{customFinalBlock.description}</p>
                )}
                {renderCTA(customFinalBlock)}
              </div>
            )}
          </motion.div>
        </FormThemeWrapper>
      );
    }

    const endBlock = blocks.find(b => b.block_type === 'end_screen');
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 flex flex-col items-center"
        >
          <CheckCircle className="h-20 w-20 mx-auto text-green-500" />
          <h1 className="text-3xl md:text-4xl">
            {endBlock?.label || 'Obrigado!'}
          </h1>
          <p className="text-lg text-muted-foreground">
            {endBlock?.description || 'Suas respostas foram enviadas com sucesso.'}
          </p>
          {renderCTA(endBlock)}
        </motion.div>
      </div>
    );
  }

  const progressPos = form.theme.progress_position || 'top';
  const showProgress = form.theme.show_progress && progressPos !== 'none' && !isWelcome;
  const btn = formButtonProps(form.theme.button_style);
  const hasLogo = !!form.theme.logo_url;
  const showFloatingLogo = hasLogo && !isWelcome;
  const logoSize = form.theme.logo_size || 'md';
  const belowLogoTopClass = { sm: 'top-14', md: 'top-20', lg: 'top-24', xl: 'top-32' }[logoSize];
  const effectiveProgressPos =
    progressPos === 'below_logo' && !showFloatingLogo ? 'top' : progressPos;

  return (
    <FormThemeWrapper theme={form.theme} className="min-h-screen flex flex-col bg-background">
      {/* Progress bar (top) */}
      {showProgress && effectiveProgressPos === 'top' && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="h-1 bg-muted">
            <div
              className="h-full transition-all"
              style={{ width: `${progress}%`, background: 'hsl(var(--form-progress, var(--primary)))' }}
            />
          </div>
        </div>
      )}

      {/* Floating logo (hidden on welcome — welcome shows it as hero) */}
      {showFloatingLogo && (() => {
        const logoPos = form.theme.logo_position || 'center';
        const logoHeight = { sm: 'h-8', md: 'h-12', lg: 'h-16', xl: 'h-24' }[logoSize];
        const logoJustify = { left: 'justify-start pl-6', center: 'justify-center', right: 'justify-end pr-6' }[logoPos];
        return (
          <div className={`flex pt-6 ${logoJustify}`}>
            <img src={form.theme.logo_url} alt="Logo" className={`${logoHeight} object-contain`} />
          </div>
        );
      })()}

      {/* Progress bar (below logo) */}
      {showProgress && effectiveProgressPos === 'below_logo' && (
        <div className={cn('fixed left-0 right-0 z-50', belowLogoTopClass)}>
          <div className="h-1 bg-muted">
            <div
              className="h-full transition-all"
              style={{ width: `${progress}%`, background: 'hsl(var(--form-progress, var(--primary)))' }}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {currentBlock && renderBlock(currentBlock)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      {!isWelcome && currentBlock && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={isFirstStep}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>

            <span className="text-sm text-muted-foreground">
              {currentStep + 1} / {questionBlocks.length}
            </span>

            {isLastQuestionStep ? (
              <Button 
                onClick={handleSubmit} 
                disabled={submitting}
                variant={btn.variant}
                className={`gap-2 ${btn.className}`}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Enviar
              </Button>
            ) : (
              <Button onClick={handleNext} variant={btn.variant} className={`gap-2 ${btn.className}`}>
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Progress bar (bottom) */}
      {showProgress && effectiveProgressPos === 'bottom' && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="h-1 bg-muted">
            <div
              className="h-full transition-all"
              style={{ width: `${progress}%`, background: 'hsl(var(--form-progress, var(--primary)))' }}
            />
          </div>
        </div>
      )}

      {/* Branding */}
      {form.settings.show_branding !== false && (
        <div className="fixed bottom-20 left-0 right-0 text-center py-2 pointer-events-none">
          <span className="text-xs text-muted-foreground">
            {poweredByText} <strong>{platformName}</strong>
          </span>
        </div>
      )}
    </FormThemeWrapper>
  );
}
