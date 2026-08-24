// features/prontuario/util/idade.util.ts
//
// Helper de idade no formato NephroSys: "77 Anos 9 Meses".
// SSR-safe: usa apenas Date (sem window/localStorage).

/**
 * Calcula a idade em anos + meses a partir de uma data ISO (ex.: "1948-10-05"
 * ou "1948-10-05T00:00:00"). O componente de DATA e interpretado no fuso LOCAL
 * (evita o off-by-one de `new Date('yyyy-MM-dd')`, que assume UTC-meia-noite).
 *
 * @param iso        Data de nascimento ISO (ou null/undefined).
 * @param referencia Data de referencia (default: hoje) — util para testes.
 * @returns Ex.: "77 Anos 9 Meses", "1 Ano 1 Mês"; '' quando nula, invalida ou futura.
 */
export function idadeAnosMeses(
  iso: string | null | undefined,
  referencia: Date = new Date()
): string {
  if (!iso) {
    return '';
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  const nascimento = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);

  if (isNaN(nascimento.getTime())) {
    return '';
  }

  let anos = referencia.getFullYear() - nascimento.getFullYear();
  let meses = referencia.getMonth() - nascimento.getMonth();

  if (referencia.getDate() < nascimento.getDate()) {
    meses -= 1;
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  if (anos < 0) {
    return ''; // nascimento no futuro — nunca inventar valor
  }

  const rotuloAnos = anos === 1 ? 'Ano' : 'Anos';
  const rotuloMeses = meses === 1 ? 'Mês' : 'Meses';
  return `${anos} ${rotuloAnos} ${meses} ${rotuloMeses}`;
}
