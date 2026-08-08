import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import type { MeResponse } from '../useMe';
import type { LucideIcon } from 'lucide-react';
import { BellIcon, BuildingIcon, ChevronDownIcon, GearIcon, LayersIcon, LinkIcon, LogoutIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons';
import { resolveModuleIcon } from '../lucideIcons';
import { colors, overlayFixed } from '../styles';
import { supabase } from '../../lib/supabase/client';
import logo from '../../assets/logo.png';

interface HeaderProps {
  state: CorePilotState;
  actions: CorePilotActions;
  me: MeResponse | null;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

export function Header({ state, actions, me }: HeaderProps) {
  // Empresas criadas pelo cadastro (signup) sempre têm cnpjCpf; as empresas
  // de demonstração/seed, criadas antes desse campo existir, não têm. Uma
  // empresa real não deve ver as abas de exemplo Compras/Financeiro. Antes
  // de `/me` responder, `me` é null — trata como "ainda não sei", não como
  // "é a empresa seed", senão o mock pisca na tela antes de sumir.
  const mostrarAbasDeExemplo = me !== null && !me.empresa.cnpjCpf;
  const navTabs = [
    { id: 'overview' as const, label: 'Visão Geral' },
    ...(mostrarAbasDeExemplo ? [
      { id: 'compras' as const, label: 'Compras' },
      { id: 'financeiro' as const, label: 'Financeiro' },
    ] : []),
    ...state.publishedModules.map((m) => ({ id: `module:${m.id}` as const, label: m.nome })),
  ];
  const iconePorTab = new Map<string, LucideIcon>(
    state.publishedModules.map((m) => [`module:${m.id}`, resolveModuleIcon(m.icone)]),
  );
  const activeAgentsCount = (mostrarAbasDeExemplo ? 2 : 0) + state.publishedModules.length;
  const nomeEmpresa = me?.empresa.nome ?? '…';
  const nomeUsuario = me?.usuario.nome ?? '…';

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ background: colors.navy, color: '#fff', display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 8, padding: '4px 10px' }}>
          <img src={logo} alt="CorePilot" style={{ height: 32, display: 'block' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '5px 12px 5px 5px' }}>
          {me?.empresa.logoDataUrl ? (
            <img src={me.empresa.logoDataUrl} alt="" style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 6, objectFit: 'contain', background: '#fff' }} />
          ) : (
            <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 6, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{iniciais(nomeEmpresa)}</div>
          )}
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '.1px' }}>{nomeEmpresa}</span>
        </div>
        <div style={{ flex: 1, maxWidth: 460, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', borderRadius: 8, padding: '8px 12px' }}>
          <SearchIcon color="rgba(255,255,255,.7)" />
          <input type="text" placeholder="Buscar dados, contextos ou pessoas" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', outline: 'none' }} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,160,.16)', border: '1px solid rgba(14,165,160,.4)', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: colors.teal400 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.teal, display: 'inline-block' }} />
            {activeAgentsCount} agentes ativos
          </div>
          <BellIcon style={{ cursor: 'pointer' }} />
          <div style={{ position: 'relative' }}>
            <div onClick={actions.toggleUserMenu} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: colors.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{iniciais(nomeUsuario)}</div>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{nomeUsuario}</span>
              <ChevronDownIcon />
            </div>
            {state.userMenuOpen && (
              <>
                <div style={overlayFixed} onClick={actions.closeUserMenu} />
                <div style={{ position: 'absolute', top: 38, right: 0, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, boxShadow: '0 12px 28px rgba(7,54,74,.18)', minWidth: 210, zIndex: 50, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.borderLight}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{nomeUsuario}</div>
                    <div style={{ fontSize: 11.5, color: colors.textFaint }}>{me?.usuario.email ?? ''}</div>
                  </div>
                  <div onClick={actions.openUsersFromMenu} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <UsersIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Usuários e perfis</span>
                  </div>
                  <div onClick={actions.openGeneralSettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <GearIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações Gerais</span>
                  </div>
                  <div onClick={actions.openCompanySettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <BuildingIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações da empresa</span>
                  </div>
                  <div onClick={actions.openConectores} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <LinkIcon size={15} color={colors.textMuted} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Conectores</span>
                  </div>
                  <div onClick={() => void actions.goAdminModulos()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.text }}>
                    <LayersIcon size={15} color={colors.textMuted} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Módulos</span>
                  </div>
                  <div onClick={() => void supabase.auth.signOut()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', color: colors.danger, borderTop: `1px solid ${colors.borderLight}` }}>
                    <LogoutIcon />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Sair</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 4, padding: '0 24px' }}>
        {navTabs.map((tab) => {
          const active = tab.id === state.view;
          const IconeTab = iconePorTab.get(tab.id);
          return (
            <div key={tab.id} onClick={() => actions.setView(tab.id)} style={{ padding: '14px 16px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              {IconeTab && <IconeTab size={14} color={active ? colors.navy : colors.textMuted} />}
              <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? colors.navy : colors.textMuted }}>{tab.label}</span>
              {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
            </div>
          );
        })}
        <div style={{ marginLeft: 'auto', padding: '10px 0' }}>
          <button onClick={actions.viewWizardNew} style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            <PlusIcon />
            Criar módulo
          </button>
        </div>
      </div>
    </div>
  );
}
