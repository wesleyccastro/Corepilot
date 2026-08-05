import { executorPadrao, executorValido } from './tipo-executor';

describe('tipo-executor', () => {
  it('define um único executor válido pra tarefa_agente, decisao_automatica e espera', () => {
    expect(executorPadrao('tarefa_agente')).toBe('agente');
    expect(executorPadrao('decisao_automatica')).toBe('automatico');
    expect(executorPadrao('espera')).toBe('automatico');
  });

  it('define o executor padrão como o primeiro válido pra aprovacao e integracao', () => {
    expect(executorPadrao('aprovacao')).toBe('usuario');
    expect(executorPadrao('integracao')).toBe('integracao');
  });

  it('valida combinações permitidas', () => {
    expect(executorValido('aprovacao', 'usuario')).toBe(true);
    expect(executorValido('aprovacao', 'agente_mais_usuario')).toBe(true);
    expect(executorValido('integracao', 'agente_mais_integracao')).toBe(true);
  });

  it('rejeita combinações não permitidas', () => {
    expect(executorValido('interacao_usuario', 'automatico')).toBe(false);
    expect(executorValido('tarefa_agente', 'usuario')).toBe(false);
    expect(executorValido('decisao_automatica', 'agente')).toBe(false);
  });
});
