import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Form, FormBlock, getBlockConfig, SelectOption, ScaleOptions, isMediaBlock } from '@/types/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Progress component replaced by custom themed bar
import { cn } from '@/lib/utils';
import { 
  ChevronRight, ChevronLeft, ChevronUp, Check, 
  ArrowRight, Hand, Sparkles 
} from 'lucide-react';
import { FormBlockMedia } from './FormBlockMedia';
import { formButtonProps } from './FormThemeWrapper';

interface FormLivePreviewProps {
  form: Form;
  blocks: FormBlock[];
  theme: 'light' | 'dark';
  onComplete?: () => void;
}

// Animation variants for smooth transitions
const slideVariants = {
  enter: (direction: number) => ({
    y: direction > 0 ? 100 : -100,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    y: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    y: direction < 0 ? 100 : -100,
    opacity: 0,
    scale: 0.95,
  }),
};

const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.2,
    },
  },
} as const;

const staggerItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
  },
} as const;

const buttonHoverVariants = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.02,
    transition: { type: 'spring' as const, stiffness: 400, damping: 10 }
  },
  tap: { scale: 0.98 },
} as const;

export function FormLivePreview({ form, blocks, theme, onComplete }: FormLivePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [inputValue, setInputValue] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  // Filter visible blocks (exclude logic blocks)
  const visibleBlocks = blocks.filter(b => 
    !['conditional', 'score', 'tag', 'hidden_field'].includes(b.block_type)
  );

  const currentBlock = visibleBlocks[currentIndex];
  const progress = visibleBlocks.length > 0 
    ? ((currentIndex + 1) / visibleBlocks.length) * 100 
    : 0;

  const btn = formButtonProps(form.theme?.button_style);


  // Theme styles — colors are now driven by FormThemeWrapper CSS vars
  const themeStyles = {
    bg: 'bg-background',
    text: 'text-foreground',
    muted: 'text-muted-foreground',
    input: 'bg-background border-input text-foreground placeholder:text-muted-foreground',
    card: 'bg-muted/40',
    optionBorder: 'border-border',
    optionHover: 'hover:border-primary hover:bg-primary/10',
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowUp' || (e.key === 'Backspace' && !inputValue)) {
        if (currentIndex > 0) {
          handlePrevious();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, inputValue]);

  const handleNext = useCallback(() => {
    if (!currentBlock) return;
    
    // Save current response
    if (inputValue || responses[currentBlock.id]) {
      setResponses(prev => ({
        ...prev,
        [currentBlock.id]: inputValue || prev[currentBlock.id],
      }));
    }

    if (currentIndex < visibleBlocks.length - 1) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
    } else {
      setIsCompleted(true);
      onComplete?.();
    }
  }, [currentBlock, currentIndex, visibleBlocks.length, inputValue, responses, onComplete]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
      // Restore previous input value
      const prevBlock = visibleBlocks[currentIndex - 1];
      if (prevBlock) {
        const prevValue = responses[prevBlock.id];
        setInputValue(prevValue?.toString() || '');
      }
    }
  }, [currentIndex, visibleBlocks, responses]);

  const handleOptionSelect = (value: string | boolean | number) => {
    setResponses(prev => ({
      ...prev,
      [currentBlock.id]: value,
    }));
    // Auto-advance after selection with a slight delay for visual feedback
    setTimeout(() => {
      handleNext();
    }, 300);
  };

  // Empty state
  if (visibleBlocks.length === 0) {
    return (
      <div className={cn(
        "min-h-[500px] flex items-center justify-center p-8",
        themeStyles.bg, themeStyles.muted
      )}>
        <p>Adicione blocos para visualizar o formulário</p>
      </div>
    );
  }

  // Completed state
  if (isCompleted) {
    const endScreen = visibleBlocks.find(b => b.block_type === 'end_screen');
    return (
      <div className={cn("min-h-[500px] flex flex-col", themeStyles.bg)}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="flex-1 flex flex-col items-center justify-center text-center p-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6 shadow-lg shadow-green-500/30"
          >
            <Check className="h-10 w-10 text-white" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={cn("text-3xl mb-3", themeStyles.text)}
          >
            {endScreen?.label || 'Obrigado!'}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={cn("text-lg max-w-md", themeStyles.muted)}
          >
            {endScreen?.description || 'Suas respostas foram enviadas com sucesso.'}
          </motion.p>
          {endScreen?.block_settings?.cta_text && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button size="lg" className="mt-8">
                {endScreen.block_settings.cta_text as string}
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  const renderBlockContent = (block: FormBlock) => {
    const config = getBlockConfig(block.block_type);

    switch (block.block_type) {
      case 'welcome_screen':
        return (
          <motion.div 
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-center justify-center text-center px-6"
          >
            {form.theme?.logo_url ? (
              <motion.img
                variants={staggerItemVariants}
                src={form.theme.logo_url}
                alt="Logo"
                className={cn(
                  'object-contain mb-6',
                  { sm: 'h-16', md: 'h-20', lg: 'h-28', xl: 'h-36' }[form.theme?.logo_size || 'md']
                )}
              />
            ) : (
              <motion.div
                variants={staggerItemVariants}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-6 shadow-lg"
              >
                <Hand className="h-8 w-8 text-primary-foreground" />
              </motion.div>
            )}
            <motion.h1 
              variants={staggerItemVariants}
              className={cn("text-3xl md:text-4xl mb-4", themeStyles.text)}
            >
              {block.label}
            </motion.h1>
            {block.description && (
              <motion.p 
                variants={staggerItemVariants}
                className={cn("text-lg md:text-xl mb-10 max-w-lg", themeStyles.muted)}
              >
                {block.description}
              </motion.p>
            )}
            <motion.div variants={staggerItemVariants}>
              <motion.div
                variants={buttonHoverVariants}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
              >
                <Button 
                  size="lg" 
                  variant={btn.variant}
                  className={cn("gap-3 text-lg px-8 py-6 rounded-xl shadow-lg shadow-primary/30", btn.className)}
                  onClick={handleNext}
                >
                  Começar
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </motion.div>
            </motion.div>
            <motion.p 
              variants={staggerItemVariants}
              className={cn("mt-8 text-sm", themeStyles.muted)}
            >
              Pressione <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">Enter ↵</kbd> para continuar
            </motion.p>
          </motion.div>
        );

      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'textarea':
        return (
          <motion.div 
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-xl mx-auto px-6"
          >
            <motion.div variants={staggerItemVariants} className="mb-8">
              <h2 className={cn("text-2xl md:text-3xl mb-2", themeStyles.text)}>
                {block.label}
                {block.required && <span className="text-red-500 ml-1">*</span>}
              </h2>
              {block.description && (
                <p className={cn("text-lg", themeStyles.muted)}>{block.description}</p>
              )}
            </motion.div>
            
            <motion.div variants={staggerItemVariants}>
              {block.block_type === 'textarea' ? (
                <textarea 
                  className={cn(
                    "w-full p-4 rounded-xl border-2 text-xl resize-none transition-all",
                    "focus:ring-2 focus:ring-primary focus:border-primary",
                    themeStyles.input, themeStyles.text
                  )}
                  placeholder={block.placeholder || 'Digite aqui...'}
                  rows={4}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  autoFocus
                />
              ) : (
                <Input
                  type={block.block_type === 'email' ? 'email' : block.block_type === 'phone' ? 'tel' : block.block_type === 'number' ? 'number' : 'text'}
                  className={cn(
                    "h-16 text-xl px-5 rounded-xl border-2 transition-all",
                    "focus:ring-2 focus:ring-primary focus:border-primary",
                    themeStyles.input, themeStyles.text
                  )}
                  placeholder={block.placeholder || 'Digite aqui...'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  autoFocus
                />
              )}
            </motion.div>
            
            <motion.div variants={staggerItemVariants} className="flex items-center gap-4 mt-6">
              <motion.div
                variants={buttonHoverVariants}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
              >
                <Button 
                  onClick={handleNext}
                  disabled={block.required && !inputValue.trim()}
                  variant={btn.variant}
                  className={cn("gap-2 px-6 h-12 rounded-xl", btn.className)}
                >
                  OK
                  <Check className="h-4 w-4" />
                </Button>
              </motion.div>
              <span className={cn("text-sm", themeStyles.muted)}>
                ou pressione <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">Enter ↵</kbd>
              </span>
            </motion.div>
          </motion.div>
        );

      case 'select':
      case 'multi_select':
        const selectOptions = block.options as SelectOption[];
        return (
          <motion.div 
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-xl mx-auto px-6"
          >
            <motion.div variants={staggerItemVariants} className="mb-8">
              <h2 className={cn("text-2xl md:text-3xl mb-2", themeStyles.text)}>
                {block.label}
                {block.required && <span className="text-red-500 ml-1">*</span>}
              </h2>
              {block.description && (
                <p className={cn("text-lg", themeStyles.muted)}>{block.description}</p>
              )}
            </motion.div>
            
            <div className="space-y-3">
              {Array.isArray(selectOptions) && selectOptions.map((option, idx) => {
                const isSelected = responses[block.id] === option.value;
                return (
                  <motion.button
                    key={idx}
                    variants={staggerItemVariants}
                    whileHover={{ scale: 1.01, x: 4 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleOptionSelect(option.value)}
                    className={cn(
                      "w-full p-5 rounded-xl border-2 text-left transition-all",
                      themeStyles.optionBorder,
                      isSelected 
                        ? 'border-primary bg-primary/10' 
                        : themeStyles.optionHover
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <span className={cn(
                        "w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all",
                        isSelected 
                          ? 'border-primary bg-primary text-primary-foreground' 
                          : 'border-current opacity-50'
                      )}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className={cn("text-lg", themeStyles.text)}>{option.label}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        );

      case 'yes_no':
        return (
          <motion.div 
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-xl mx-auto px-6"
          >
            <motion.div variants={staggerItemVariants} className="mb-8">
              <h2 className={cn("text-2xl md:text-3xl mb-2", themeStyles.text)}>
                {block.label}
                {block.required && <span className="text-red-500 ml-1">*</span>}
              </h2>
            </motion.div>
            
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: true, label: 'Sim', key: 'Y', color: 'from-green-500 to-emerald-500' },
                { value: false, label: 'Não', key: 'N', color: 'from-red-500 to-rose-500' },
              ].map((opt, idx) => {
                const isSelected = responses[block.id] === opt.value;
                return (
                  <motion.button
                    key={opt.key}
                    variants={staggerItemVariants}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOptionSelect(opt.value)}
                    className={cn(
                      "p-6 rounded-xl border-2 transition-all",
                      themeStyles.optionBorder,
                      isSelected 
                        ? 'border-primary bg-primary/10' 
                        : themeStyles.optionHover
                    )}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <span className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-lg",
                        `bg-gradient-to-br ${opt.color}`
                      )}>
                        {opt.key}
                      </span>
                      <span className={cn("text-lg font-medium", themeStyles.text)}>{opt.label}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        );

      case 'scale':
        const scaleOptions = block.options as ScaleOptions;
        const min = scaleOptions?.min || 1;
        const max = scaleOptions?.max || 10;
        const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);

        return (
          <motion.div 
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-xl mx-auto px-6"
          >
            <motion.div variants={staggerItemVariants} className="mb-8">
              <h2 className={cn("text-2xl md:text-3xl mb-2", themeStyles.text)}>
                {block.label}
                {block.required && <span className="text-red-500 ml-1">*</span>}
              </h2>
            </motion.div>
            
            <motion.div variants={staggerItemVariants} className="flex justify-between gap-2">
              {range.map((num) => {
                const isSelected = responses[block.id] === num;
                return (
                  <motion.button
                    key={num}
                    whileHover={{ scale: 1.1, y: -4 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleOptionSelect(num)}
                    className={cn(
                      "flex-1 aspect-square rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all",
                      themeStyles.optionBorder,
                      isSelected 
                        ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
                        : themeStyles.optionHover
                    )}
                  >
                    {num}
                  </motion.button>
                );
              })}
            </motion.div>
            {(scaleOptions?.min_label || scaleOptions?.max_label) && (
              <motion.div variants={staggerItemVariants} className="flex justify-between mt-3">
                <span className={cn("text-sm", themeStyles.muted)}>{scaleOptions?.min_label}</span>
                <span className={cn("text-sm", themeStyles.muted)}>{scaleOptions?.max_label}</span>
              </motion.div>
            )}
          </motion.div>
        );

      case 'ai_question':
      case 'ai_followup':
        return (
          <motion.div 
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-xl mx-auto px-6"
          >
            <motion.div variants={staggerItemVariants} className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className={cn("text-sm font-medium text-primary")}>Pergunta Inteligente</span>
              </div>
              <h2 className={cn("text-2xl md:text-3xl mb-2", themeStyles.text)}>
                {block.label}
                {block.required && <span className="text-red-500 ml-1">*</span>}
              </h2>
              {block.description && (
                <p className={cn("text-lg", themeStyles.muted)}>{block.description}</p>
              )}
            </motion.div>
            
            <motion.div variants={staggerItemVariants}>
              <textarea 
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-xl resize-none transition-all",
                  "focus:ring-2 focus:ring-primary focus:border-primary",
                  themeStyles.input, themeStyles.text
                )}
                placeholder="Conte-nos mais..."
                rows={4}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
              />
            </motion.div>
            
            <motion.div variants={staggerItemVariants} className="flex items-center gap-4 mt-6">
              <Button 
                onClick={handleNext}
                disabled={block.required && !inputValue.trim()}
                variant={btn.variant}
                className={cn("gap-2 px-6 h-12 rounded-xl", btn.className)}
              >
                OK
                <Check className="h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        );

      case 'image':
      case 'video_upload':
      case 'video_embed':
      case 'carousel':
      case 'divider':
        return (
          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full"
          >
            <motion.div variants={staggerItemVariants}>
              <FormBlockMedia block={block} />
            </motion.div>
            <motion.div variants={staggerItemVariants} className="flex justify-center mt-6">
              <Button onClick={handleNext} variant={btn.variant} className={cn("gap-2 px-6 h-12 rounded-xl", btn.className)}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        );

      case 'end_screen':
        // End screen is handled by completion state
        handleNext();
        return null;

      default:
        return null;
    }
  };

  const progressPos = form.theme?.progress_position || 'top';
  const showProgress = form.theme?.show_progress !== false && progressPos !== 'none';
  const progressColorVar = 'hsl(var(--form-progress, var(--primary)))';
  const logoSize = form.theme?.logo_size || 'md';
  const logoPos = form.theme?.logo_position || 'center';
  const logoHeight = { sm: 'h-6', md: 'h-10', lg: 'h-14', xl: 'h-20' }[logoSize];
  const logoJustify = { left: 'justify-start pl-14', center: 'justify-center', right: 'justify-end pr-14' }[logoPos];
  const hasLogo = !!form.theme?.logo_url;
  const isWelcome = currentBlock?.block_type === 'welcome_screen';
  const showFloatingLogo = hasLogo && !isWelcome;
  // Vertical offset so progress bar sits right below the floating logo
  const belowLogoTopClass = { sm: 'top-12', md: 'top-16', lg: 'top-20', xl: 'top-28' }[logoSize];
  const effectiveProgressPos =
    progressPos === 'below_logo' && !showFloatingLogo ? 'top' : progressPos;

  return (
    <div className={cn("min-h-[500px] flex flex-col relative overflow-hidden", themeStyles.bg)}>
      {/* Progress bar */}
      {showProgress && (
        <div
          className={cn(
            'absolute left-0 right-0 z-10',
            effectiveProgressPos === 'top' && 'top-0',
            effectiveProgressPos === 'bottom' && 'bottom-0',
            effectiveProgressPos === 'below_logo' && belowLogoTopClass,
          )}
        >
          <div className="h-1 bg-muted">
            <div
              className="h-full transition-all"
              style={{ width: `${progress}%`, background: progressColorVar }}
            />
          </div>
        </div>
      )}

      {/* Logo (floating top — hidden on welcome, since welcome shows it as hero) */}
      {showFloatingLogo && (
        <div className={cn("absolute left-0 right-0 z-10 flex top-3", logoJustify)}>
          <img src={form.theme.logo_url} alt="Logo" className={cn(logoHeight, 'object-contain')} />
        </div>
      )}

      {/* Navigation and counter */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className={cn(
            "p-2 rounded-lg transition-opacity",
            currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-70 hover:opacity-100',
            themeStyles.text
          )}
        >
          <ChevronUp className="h-5 w-5" />
        </motion.button>
        
        <span className={cn("text-sm font-medium", themeStyles.muted)}>
          {currentIndex + 1} / {visibleBlocks.length}
        </span>
        
        <div className="w-9" /> {/* Spacer for alignment */}
      </div>

      {/* Main content with animations */}
      <div className="flex-1 flex items-center justify-center py-16">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentBlock?.id || 'empty'}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              y: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="w-full"
          >
            {currentBlock && renderBlockContent(currentBlock)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer with keyboard hint */}
      <div className={cn(
        "absolute bottom-4 left-0 right-0 flex justify-center",
        themeStyles.muted
      )}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.6, y: 0 }}
          className="flex items-center gap-4 text-xs"
        >
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">↑</kbd> voltar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Enter</kbd> continuar
          </span>
        </motion.div>
      </div>
    </div>
  );
}
