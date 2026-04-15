export function fmtEur(n: number | null | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtKm(n: number | null | undefined): string {
  if (typeof n !== 'number') return '—';
  return `${new Intl.NumberFormat('nl-BE').format(n)} km`;
}

export function fmtNumber(n: number | null | undefined): string {
  if (typeof n !== 'number') return '—';
  return new Intl.NumberFormat('nl-BE').format(n);
}

export function fmtPct(n: number | null | undefined, withSign = true): string {
  if (typeof n !== 'number') return '—';
  const sign = n > 0 && withSign ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} u geleden`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days} d geleden`;
  return d.toLocaleDateString('nl-BE');
}

export function scoreClass(score: number | null | undefined): string {
  if (typeof score !== 'number') return 'badge-info';
  if (score >= 80) return 'badge-good';
  if (score >= 60) return 'badge-warn';
  return 'badge-bad';
}

export function recoClass(reco: string | null | undefined): string {
  switch (reco) {
    case 'KOPEN': return 'badge-good';
    case 'TWIJFEL': return 'badge-warn';
    case 'NEGEREN': return 'badge-bad';
    default: return 'badge-info';
  }
}
