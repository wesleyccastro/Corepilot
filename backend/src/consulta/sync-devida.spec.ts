import { estaDevida } from './sync-devida';

describe('estaDevida', () => {
  it('está devida quando nunca sincronizou', () => {
    expect(estaDevida(null, 60)).toBe(true);
  });

  it('não está devida quando não há intervalo configurado', () => {
    expect(estaDevida(new Date(), null)).toBe(false);
  });

  it('não está devida quando o intervalo ainda não passou', () => {
    const cincoMinutosAtras = new Date(Date.now() - 5 * 60_000);
    expect(estaDevida(cincoMinutosAtras, 60)).toBe(false);
  });

  it('está devida quando o intervalo já passou', () => {
    const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60_000);
    expect(estaDevida(duasHorasAtras, 60)).toBe(true);
  });
});
