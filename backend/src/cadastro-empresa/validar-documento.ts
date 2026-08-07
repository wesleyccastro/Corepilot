function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function todosDigitosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function calcularDigitoVerificador(digitos: string, pesos: number[]): number {
  const soma = digitos
    .split('')
    .reduce((acc, digito, i) => acc + Number(digito) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarCpf(digitos: string): boolean {
  if (digitos.length !== 11 || todosDigitosIguais(digitos)) return false;

  const base = digitos.slice(0, 9);
  const d1 = calcularDigitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigitoVerificador(
    base + String(d1),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return digitos === base + String(d1) + String(d2);
}

function validarCnpj(digitos: string): boolean {
  if (digitos.length !== 14 || todosDigitosIguais(digitos)) return false;

  const base = digitos.slice(0, 12);
  const d1 = calcularDigitoVerificador(
    base,
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const d2 = calcularDigitoVerificador(
    base + String(d1),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return digitos === base + String(d1) + String(d2);
}

/** Remove máscara/pontuação, mantendo só os dígitos. */
export function normalizarCnpjCpf(valor: string): string {
  return apenasDigitos(valor);
}

/** Aceita CPF (11 dígitos) ou CNPJ (14 dígitos), com dígito verificador. */
export function validarCnpjCpf(valor: string): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return validarCpf(digitos);
  if (digitos.length === 14) return validarCnpj(digitos);
  return false;
}
