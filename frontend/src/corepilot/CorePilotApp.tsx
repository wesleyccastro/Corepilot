import { useCorePilotState } from './useCorePilotState';
import { useMe } from './useMe';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Overview } from './views/Overview';
import { ComprasView } from './views/compras/ComprasView';
import { FinanceiroView } from './views/financeiro/FinanceiroView';
import { CustomModuleView } from './views/CustomModuleView';
import { Wizard } from './views/wizard/Wizard';
import { AdminUsers } from './views/admin/AdminUsers';
import { AdminSettings } from './views/admin/AdminSettings';
import { AdminCompany } from './views/admin/AdminCompany';
import { AdminModulos } from './views/admin/AdminModulos';

export function CorePilotApp({ accessToken }: { accessToken: string }) {
  const { state, actions, refs } = useCorePilotState(accessToken);
  const { me, refetch: refetchMe } = useMe(accessToken);
  const activeModule = state.publishedModules.find((m) => state.view === `module:${m.id}`);

  return (
    <div style={{ height: '100vh', background: '#F7F8F6', color: '#1F2A2E', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header state={state} actions={actions} me={me} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {state.view === 'overview' && <Overview state={state} actions={actions} scrollRef={refs.overviewScrollRef} me={me} />}
        {state.view === 'compras' && <ComprasView state={state} actions={actions} scrollRef={refs.comprasScrollRef} />}
        {state.view === 'financeiro' && <FinanceiroView state={state} actions={actions} scrollRef={refs.financeiroScrollRef} />}
        {state.view === 'wizard' && <Wizard state={state} actions={actions} />}
        {state.view === 'admin-users' && <AdminUsers state={state} actions={actions} />}
        {state.view === 'admin-settings' && <AdminSettings state={state} actions={actions} />}
        {state.view === 'admin-company' && <AdminCompany state={state} actions={actions} accessToken={accessToken} me={me} onEmpresaUpdated={refetchMe} />}
        {state.view === 'admin-modulos' && <AdminModulos state={state} actions={actions} />}
        {activeModule && <CustomModuleView module={activeModule} state={state} actions={actions} />}
      </div>

      <Toast message={state.toast} />
      <ConfirmDialog state={state} actions={actions} />
    </div>
  );
}
