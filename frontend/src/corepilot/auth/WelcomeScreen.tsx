import { colors } from '../styles';
import { CheckCircleIcon } from '../icons';
import { AuthHeroPanel } from './AuthHeroPanel';
import logo from '../../assets/logo.png';

interface WelcomeScreenProps {
  razaoSocial: string;
  onContinuar: () => void;
}

export function WelcomeScreen({ razaoSocial, onContinuar }: WelcomeScreenProps) {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', background: colors.bg }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' }}>
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <img src={logo} alt="CorePilot" style={{ height: 100, display: 'block', margin: '0 auto 32px' }} />

          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: colors.successBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <CheckCircleIcon size={28} color={colors.success} strokeWidth={2.2} />
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>Bem-vindo(a) à CorePilot!</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px', lineHeight: 1.6 }}>
            A conta de <strong>{razaoSocial}</strong> foi criada com sucesso. Você já está logado(a) e pronto(a) para configurar seus primeiros módulos.
          </p>

          <button
            type="button"
            onClick={onContinuar}
            style={{ width: '100%', background: colors.navy, color: '#fff', border: 'none', borderRadius: 9, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Continuar
          </button>
        </div>
      </div>

      <AuthHeroPanel />
    </div>
  );
}
