import { assinarEstado, verificarEstado } from './estado-oauth';

describe('estado-oauth (assinatura HMAC do state do OAuth2)', () => {
  const segredo = 'segredo-de-teste';

  it('assina e verifica de volta o mesmo payload', () => {
    const payload = {
      usuarioId: 'usuario-1',
      empresaId: 'empresa-1',
      provider: 'google',
      jti: 'nonce-de-teste',
      exp: Date.now() + 60_000,
    };

    const estado = assinarEstado(payload, segredo);
    const verificado = verificarEstado(estado, segredo);

    expect(verificado).toEqual(payload);
  });

  it('preserva o jti (nonce de uso único) através do ciclo assinar/verificar', () => {
    const estado = assinarEstado(
      {
        usuarioId: 'u1',
        empresaId: 'e1',
        provider: 'google',
        jti: 'nonce-unico-123',
        exp: Date.now() + 60_000,
      },
      segredo,
    );

    const verificado = verificarEstado(estado, segredo);

    expect(verificado.jti).toBe('nonce-unico-123');
  });

  it('rejeita um state com assinatura adulterada', () => {
    const estado = assinarEstado(
      {
        usuarioId: 'u1',
        empresaId: 'e1',
        provider: 'google',
        jti: 'nonce-de-teste',
        exp: Date.now() + 60_000,
      },
      segredo,
    );
    const [base64] = estado.split('.');
    const adulterado = `${base64}.0000000000000000000000000000000000000000000000000000000000000000`;

    expect(() => verificarEstado(adulterado, segredo)).toThrow();
  });

  it('rejeita um state assinado com outro segredo', () => {
    const estado = assinarEstado(
      {
        usuarioId: 'u1',
        empresaId: 'e1',
        provider: 'google',
        jti: 'nonce-de-teste',
        exp: Date.now() + 60_000,
      },
      segredo,
    );

    expect(() => verificarEstado(estado, 'outro-segredo')).toThrow();
  });

  it('rejeita um state malformado (sem separador)', () => {
    expect(() => verificarEstado('nao-e-um-state-valido', segredo)).toThrow();
  });

  it('rejeita um state expirado', () => {
    const estado = assinarEstado(
      {
        usuarioId: 'u1',
        empresaId: 'e1',
        provider: 'google',
        jti: 'nonce-de-teste',
        exp: Date.now() - 1000,
      },
      segredo,
    );

    expect(() => verificarEstado(estado, segredo)).toThrow('expirado');
  });
});
