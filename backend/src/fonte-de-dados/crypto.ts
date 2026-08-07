import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITMO = 'aes-256-gcm';

export function criptografar(texto: string, chaveHex: string): string {
  const chave = Buffer.from(chaveHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, chave, iv);

  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`;
}

export function descriptografar(
  textoCriptografado: string,
  chaveHex: string,
): string {
  const [ivHex, authTagHex, cifradoHex] = textoCriptografado.split(':');
  const chave = Buffer.from(chaveHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const cifrado = Buffer.from(cifradoHex, 'hex');

  const decipher = createDecipheriv(ALGORITMO, chave, iv);
  decipher.setAuthTag(authTag);

  const decifrado = Buffer.concat([decipher.update(cifrado), decipher.final()]);
  return decifrado.toString('utf8');
}
