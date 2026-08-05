import { chaveIdempotencia } from './idempotencia';

describe('chaveIdempotencia', () => {
  it('combina instância, etapa e número da execução', () => {
    expect(chaveIdempotencia('inst-1', 'etapa-1', 1)).toBe('inst-1:etapa-1:1');
  });

  it('gera chaves diferentes pra reexecuções da mesma etapa (loop)', () => {
    expect(chaveIdempotencia('inst-1', 'etapa-1', 1)).not.toBe(chaveIdempotencia('inst-1', 'etapa-1', 2));
  });
});
