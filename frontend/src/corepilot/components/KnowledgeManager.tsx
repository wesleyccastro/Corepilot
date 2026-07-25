import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { DotsIcon, FileIcon, FolderIcon, LinkIcon, SpinnerIcon, TextIcon } from '../icons';
import { btnPrimary, colors, dropdownMenu, dropdownMenuItem, inputSm, overlayFixed } from '../styles';
import type { KnowledgeSource, KnowledgeSourceType } from '../types';

const knowledgeStatusMeta: Record<string, { label: string; bg: string; color: string }> = {
  indexed: { label: 'Indexada', bg: colors.successBg, color: colors.success },
  synced: { label: 'Sincronizada', bg: colors.successBg, color: colors.success },
  processing: { label: 'Processando', bg: colors.warnBg, color: colors.warn },
};

const knowledgeTypeLabels: Record<KnowledgeSourceType, string> = { text: 'Texto colado', file: 'Upload', link: 'Link', folder: 'Pasta do Drive' };
const knowledgeTypeDefs: { type: KnowledgeSourceType; label: string }[] = [
  { type: 'text', label: 'Digitar um texto' },
  { type: 'file', label: 'Anexar PDF/planilha' },
  { type: 'link', label: 'Link do Drive' },
  { type: 'folder', label: 'Pasta do Drive' },
];

interface KnowledgeManagerProps {
  scope: 'module' | 'general';
  state: CorePilotState;
  actions: CorePilotActions;
}

function TypeIcon({ type }: { type: KnowledgeSourceType }) {
  if (type === 'file') return <FileIcon style={{ flexShrink: 0 }} />;
  if (type === 'text') return <TextIcon style={{ flexShrink: 0 }} />;
  if (type === 'link') return <LinkIcon style={{ flexShrink: 0 }} />;
  return <FolderIcon style={{ flexShrink: 0 }} />;
}

export function KnowledgeManager({ scope, state, actions }: KnowledgeManagerProps) {
  const isModule = scope === 'module';
  const sources = isModule ? state.knowledgeSources : state.generalKnowledgeSources;
  const showNew = isModule ? state.showNewKnowledge : state.showNewGeneralKnowledge;
  const form = isModule ? state.newKnowledgeForm : state.newGeneralKnowledgeForm;
  const editingId = isModule ? state.editingKnowledgeId : state.editingGeneralKnowledgeId;
  const menuOpenId = isModule ? state.knowledgeMenuOpenId : state.generalKnowledgeMenuOpenId;

  const toggleForm = actions.toggleNewKnowledgeForm(scope);
  const setType = actions.setKnowledgeType(scope);
  const onFileChange = actions.onKnowledgeFileChange(scope);
  const toggleMenu = actions.toggleKnowledgeMenu(scope);
  const closeMenu = actions.closeKnowledgeMenu(scope);
  const updateField = actions.updateKnowledgeField(scope);
  const editSource = actions.editKnowledgeSource(scope);
  const removeSource = actions.removeKnowledgeSource(scope);
  const saveSource = actions.saveKnowledgeSource(scope);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: isModule ? 19 : 16, fontWeight: 800, color: colors.navy, margin: 0 }}>{isModule ? 'Base de conhecimento' : 'Base de conhecimento geral'}</h2>
        <button onClick={toggleForm} style={btnPrimary}>+ Adicionar fonte</button>
      </div>
      <p style={{ fontSize: 13, color: colors.textFaint, margin: '0 0 18px' }}>
        {isModule ? 'PDF, Word, Excel, apresentações, links ou pastas de SharePoint/Drive.' : 'PDF, Word, Excel, apresentações, links, pastas de SharePoint/Drive ou texto — documentos, estruturas e políticas da empresa.'}
      </p>

      {isModule && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {['Procedimentos', 'Políticas', 'Planejamento', 'Normas'].map((c) => (
            <span key={c} style={{ background: colors.bg, borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: colors.textMuted }}>{c}</span>
          ))}
        </div>
      )}

      {showNew && (
        <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy }}>{editingId ? 'Editar fonte' : 'Nova fonte de conhecimento'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {knowledgeTypeDefs.map((kt) => {
              const active = form.sourceType === kt.type;
              return (
                <span key={kt.type} onClick={() => setType(kt.type)} style={{ cursor: 'pointer', borderRadius: 20, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, border: `1px solid ${active ? colors.navy : colors.border}`, background: active ? colors.navy : '#fff', color: active ? '#fff' : colors.textMuted }}>
                  {kt.label}
                </span>
              );
            })}
          </div>
          <input type="text" placeholder="Nome da fonte · ex.: Manual de Boas Práticas" value={form.name} onChange={updateField('name')} style={inputSm} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="text" placeholder="Categoria · ex.: Políticas e manuais" value={form.category} onChange={updateField('category')} style={inputSm} />
            <input type="text" placeholder="Responsável" value={form.owner} onChange={updateField('owner')} style={inputSm} />
          </div>

          {form.sourceType === 'text' && (
            <textarea placeholder="Cole o texto que a IA deve usar como referência…" value={form.textContent} onChange={updateField('textContent')} rows={5} style={{ ...inputSm, fontFamily: 'inherit', resize: 'vertical' }} />
          )}
          {form.sourceType === 'file' && (
            <label style={{ border: '1px dashed #C9D1CC', borderRadius: 8, padding: 16, fontSize: 12.5, color: colors.textMuted, textAlign: 'center', cursor: 'pointer', display: 'block' }}>
              <input type="file" accept=".pdf,.xls,.xlsx,.csv,.doc,.docx" onChange={onFileChange} style={{ display: 'none' }} />
              {form.fileName ? (<><span style={{ fontWeight: 700, color: colors.navy }}>{form.fileName}</span> · clique para trocar</>) : 'Clique para anexar um PDF, Excel ou planilha CSV'}
            </label>
          )}
          {form.sourceType === 'link' && (
            <input type="text" placeholder="Link do arquivo no Google Drive, SharePoint ou OneDrive" value={form.link} onChange={updateField('link')} style={inputSm} />
          )}
          {form.sourceType === 'folder' && (
            <>
              <input type="text" placeholder="Link da pasta do Google Drive" value={form.folderLink} onChange={updateField('folderLink')} style={inputSm} />
              <div style={{ fontSize: 11.5, color: colors.textFaint }}>A IA acompanha a pasta e reindexa automaticamente quando arquivos forem adicionados ou alterados.</div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={saveSource} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {editingId ? 'Salvar alterações' : 'Adicionar fonte'}
            </button>
            <button onClick={toggleForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.textMuted, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sources.map((src: KnowledgeSource) => {
          const meta = knowledgeStatusMeta[src.status] || knowledgeStatusMeta.indexed;
          const type = src.sourceType || 'file';
          return (
            <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <TypeIcon type={type} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{src.name}</div>
                <div style={{ fontSize: 12, color: colors.textFaint }}>{knowledgeTypeLabels[type]} · {src.category} · {src.owner} · atualizado {src.updated}</div>
              </div>
              {src.status === 'processing' && <SpinnerIcon />}
              <span style={{ background: meta.bg, color: meta.color, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{meta.label}</span>
              <div style={{ position: 'relative' }}>
                <span onClick={(e) => { e.stopPropagation(); toggleMenu(src.id); }}><DotsIcon size={16} /></span>
                {menuOpenId === src.id && (
                  <>
                    <div style={overlayFixed} onClick={closeMenu} />
                    <div style={dropdownMenu}>
                      <div onClick={() => editSource(src.id)} style={dropdownMenuItem}>Editar</div>
                      <div onClick={() => removeSource(src.id)} style={{ ...dropdownMenuItem, color: colors.danger, borderTop: `1px solid ${colors.borderLight}` }}>Remover</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
