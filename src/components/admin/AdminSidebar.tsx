import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react';

import {
  fixedItems,
  menuGroups,
  findGroupIdForSection,
} from '@/config/adminMenu';
import type { AdminMenuItem } from '@/config/adminMenu';
import { useIsSuperAdmin } from '@/hooks/useSuperAdmin';
import { prefetchAdminSection } from '@/pages/Admin';
import { useOrganizationStatus } from '@/hooks/useOrganizationStatus';
import { toast } from '@/hooks/use-toast';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';

interface AdminSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { signOut, isAdmin, profile } = useAuth();
  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);
  const navigate = useNavigate();
  const { isSuspended } = useOrganizationStatus();
  const lockedToPlan = isSuspended && !isSuperAdmin;
  // Perfis não-admin não veem itens marcados `adminOnly` (áreas técnicas).
  const canSeeAdminOnly = isAdmin() || !!isSuperAdmin;
  const canSeeItem = (item: AdminMenuItem) =>
    (!item.adminOnly || canSeeAdminOnly) && (!item.featureKey || effectivePlan?.features?.[item.featureKey] === true);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };


  const activeGroupId = findGroupIdForSection(activeSection);

  const renderMenuItem = (item: AdminMenuItem) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    const lockedHere = lockedToPlan && item.id !== 'plan';
    const isDisabled = !!item.comingSoon || lockedHere;


    return (
      <button
        key={item.id}
        onClick={() => {
          if (isDisabled) {
            if (lockedHere) {
              toast({
                title: 'Acesso bloqueado',
                description: 'Regularize o pagamento para liberar o acesso.',
              });
            }
            return;
          }
          onSectionChange(item.id);
        }}
        onMouseEnter={() => !isDisabled && prefetchAdminSection(item.id)}
        onTouchStart={() => !isDisabled && prefetchAdminSection(item.id)}
        onFocus={() => !isDisabled && prefetchAdminSection(item.id)}
        aria-disabled={isDisabled}
        title={
          lockedHere
            ? `${item.label} — bloqueado (regularize o pagamento)`
            : item.comingSoon
              ? `${item.label} — em breve`
              : item.label
        }
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
          collapsed && 'justify-center px-2',
          isDisabled
            ? 'text-sidebar-foreground/50 cursor-not-allowed hover:bg-transparent'
            : isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent'
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        {!collapsed && (
          <span className="flex-1 text-left truncate">{item.label}</span>
        )}
        {!collapsed && item.comingSoon && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            em breve
          </Badge>
        )}
      </button>
    );
  };


  return (
    <aside
      className={cn(
        'h-screen bg-sidebar-background border-r border-sidebar-border flex flex-col transition-all duration-300 sticky top-0 overflow-hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Settings className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">Admin</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Back to Dashboard */}
      <div className="p-2 border-b border-sidebar-border flex-shrink-0">
        <NavLink to={lockedToPlan ? '/admin?tab=plan' : '/'}>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent',
              collapsed && 'justify-center px-2'
            )}
            onClick={(e) => {
              if (lockedToPlan) {
                e.preventDefault();
                onSectionChange('plan');
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Voltar ao App</span>}
          </Button>
        </NavLink>
      </div>


      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto min-h-0">
        {/* Fixos */}
        {fixedItems.filter(canSeeItem).map(renderMenuItem)}

        {collapsed ? (
          <>
            {/* Modo colapsado: lista plana de ícones */}
            <div className="py-2">
              <Separator className="bg-sidebar-border" />
            </div>
            {menuGroups.flatMap((g) => g.items).filter(canSeeItem).map(renderMenuItem)}
          </>
        ) : (
          <>
            <div className="pt-3 pb-1">
              <Separator className="bg-sidebar-border" />
            </div>

            <Accordion
              type="multiple"
              defaultValue={activeGroupId ? [activeGroupId] : []}
              className="w-full"
            >
              {menuGroups.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <AccordionItem
                    key={group.id}
                    value={group.id}
                    className="border-none"
                  >
                    <AccordionTrigger className="px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:no-underline [&[data-state=open]]:bg-sidebar-accent/50">
                      <span className="flex items-center gap-3">
                        <GroupIcon className="h-4 w-4 flex-shrink-0" />
                        <span>{group.label}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-1">
                      <div className="pl-3 space-y-1 border-l border-sidebar-border ml-4">
                        {group.items.filter(canSeeItem).map(renderMenuItem)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="py-3">
              <Separator className="bg-sidebar-border" />
              {!collapsed && (
                <p className="px-3 py-2 text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
                  Plataforma
                </p>
              )}
            </div>
            <NavLink to="/super-admin">
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-sidebar-foreground hover:bg-sidebar-accent',
                  collapsed && 'justify-center px-2'
                )}
              >
                <Shield className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>Super Admin</span>}
              </button>
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border flex-shrink-0 space-y-2">
        <OrgSwitcher collapsed={collapsed} variant="sidebar" />
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className={cn(
            'w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </Button>
        <div className={cn(
          "flex items-center px-1",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <p className="text-xs text-muted-foreground">
              Admin v1.0
            </p>
          )}
          <ThemeToggle />
        </div>
      </div>

    </aside>
  );
}
