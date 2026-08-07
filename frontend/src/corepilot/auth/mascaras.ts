/** Formata progressivamente como CPF (11 dígitos) ou CNPJ (14 dígitos), conforme o usuário digita. */
export function mascararCnpjCpf(valorDigitado: string): string {
  const digitos = valorDigitado.replace(/\D/g, '').slice(0, 14);

  if (digitos.length <= 11) {
    return digitos
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digitos
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Formata progressivamente como telefone celular brasileiro: (00) 00000-0000. */
export function mascararWhatsapp(valorDigitado: string): string {
  const digitos = valorDigitado.replace(/\D/g, '').slice(0, 11);

  if (digitos.length <= 10) {
    return digitos
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }

  return digitos
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}
