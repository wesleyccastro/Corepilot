import { createHmac, timingSafeEqual } from 'crypto';

export interface EstadoOAuth {
  usuarioId: string;
  empresaId: string;
  provider: string;
  exp: number;
}

export function assinarEstado(payload: EstadoOAuth, segredo: string): string {
  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const assinatura = createHmac('sha256', segredo).update(base64).digest('hex');
  return `${base64}.${assinatura}`;
}

export function verificarEstado(estado: string, segredo: string): EstadoOAuth {
  const [base64, assinatura] = estado.split('.');
  if (!base64 || !assinatura) {
    throw new Error('state malformado');
  }

  const esperada = createHmac('sha256', segredo).update(base64).digest('hex');
  const assinaturaBuffer = Buffer.from(assinatura, 'hex');
  const esperadaBuffer = Buffer.from(esperada, 'hex');
  if (
    assinaturaBuffer.length !== esperadaBuffer.length ||
    !timingSafeEqual(assinaturaBuffer, esperadaBuffer)
  ) {
    throw new Error('state com assinatura inválida');
  }

  const payload = JSON.parse(
    Buffer.from(base64, 'base64url').toString('utf8'),
  ) as EstadoOAuth;
  if (payload.exp < Date.now()) {
    throw new Error('state expirado');
  }
  return payload;
}
