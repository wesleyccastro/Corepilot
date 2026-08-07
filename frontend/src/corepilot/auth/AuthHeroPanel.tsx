import { colors } from '../styles';
import logoIcon from '../../assets/logo-icon.png';
import heroBg from '../../assets/hero-bg.png';

export function AuthHeroPanel() {
  return (
    <div style={{ flex: 1, background: colors.navy, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, position: 'relative', overflow: 'hidden' }}>
      <img src={heroBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(7,54,74,.35) 0%, rgba(7,54,74,.55) 55%, rgba(7,54,74,.92) 100%)' }} />
      <img
        src={logoIcon}
        alt=""
        style={{ position: 'relative', height: 120, width: 'auto', marginBottom: 28, filter: 'drop-shadow(0 12px 30px rgba(0,0,0,.3))' }}
      />
      <h2 style={{ position: 'relative', color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 12px', textAlign: 'center', maxWidth: 380 }}>
        Sua empresa ganhando super poderes com IA acoplada aos principais processos.
      </h2>
      <p style={{ position: 'relative', color: 'rgba(255,255,255,.8)', fontSize: 14, textAlign: 'center', maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
        Agentes de IA conectados aos dados e processos da sua empresa — do jeito que cada equipe precisa.
      </p>
    </div>
  );
}
