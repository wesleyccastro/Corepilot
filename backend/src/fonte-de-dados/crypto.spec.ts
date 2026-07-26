import { criptografar, descriptografar } from './crypto';

describe('crypto (AES-256-GCM)', () => {
  const chave = 'a'.repeat(64); // 32 bytes em hex

  it('criptografa e descriptografa de volta para o texto original', () => {
    const cifrado = criptografar('minhaSenhaSecreta123', chave);
    expect(cifrado).not.toBe('minhaSenhaSecreta123');

    const resultado = descriptografar(cifrado, chave);
    expect(resultado).toBe('minhaSenhaSecreta123');
  });

  it('gera cifrados diferentes para o mesmo texto (IV aleatório)', () => {
    const cifrado1 = criptografar('senha', chave);
    const cifrado2 = criptografar('senha', chave);
    expect(cifrado1).not.toBe(cifrado2);
  });

  it('lança erro ao descriptografar com a chave errada', () => {
    const cifrado = criptografar('senha', chave);
    const chaveErrada = 'b'.repeat(64);
    expect(() => descriptografar(cifrado, chaveErrada)).toThrow();
  });
});
