import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MiaChatTab } from "@/components/mia/tabs/MiaChatTab";

interface MiaChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartVoice: () => void;
  onOpenConversation: (conversationId: string) => void;
}

export function MiaChatDrawer({ open, onOpenChange, onStartVoice, onOpenConversation }: MiaChatDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-l p-0 sm:max-w-[600px] [&>button]:z-50 [&>button]:right-3 [&>button]:top-3">
        <SheetHeader className="sr-only">
          <SheetTitle>Chat com a Mia</SheetTitle>
          <SheetDescription>Converse com a inteligência da sua operação.</SheetDescription>
        </SheetHeader>
        <MiaChatTab variant="drawer" onStartVoice={onStartVoice} onOpenConversation={onOpenConversation} />
      </SheetContent>
    </Sheet>
  );
}
