import { normalizarCnpjCpf, validarCnpjCpf } from './validar-documento';

describe('validarCnpjCpf', () => {
  it('aceita um CPF válido, com ou sem máscara', () => {
    expect(validarCnpjCpf('111.444.777-35')).toBe(true);
    expect(validarCnpjCpf('11144477735')).toBe(true);
  });

  it('aceita um CNPJ válido, com ou sem máscara', () => {
    expect(validarCnpjCpf('11.222.333/0001-81')).toBe(true);
    expect(validarCnpjCpf('11222333000181')).toBe(true);
  });

  it('rejeita CPF com dígito verificador incorreto', () => {
    expect(validarCnpjCpf('111.444.777-36')).toBe(false);
  });

  it('rejeita CNPJ com dígito verificador incorreto', () => {
    expect(validarCnpjCpf('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita sequências de dígitos repetidos', () => {
    expect(validarCnpjCpf('111.111.111-11')).toBe(false);
    expect(validarCnpjCpf('11.111.111/1111-11')).toBe(false);
  });

  it('rejeita valores com tamanho inválido', () => {
    expect(validarCnpjCpf('123')).toBe(false);
    expect(validarCnpjCpf('')).toBe(false);
  });
});

describe('normalizarCnpjCpf', () => {
  it('remove pontuação e mantém só os dígitos', () => {
    expect(normalizarCnpjCpf('111.444.777-35')).toBe('11144477735');
    expect(normalizarCnpjCpf('11.222.333/0001-81')).toBe('11222333000181');
  });
});
