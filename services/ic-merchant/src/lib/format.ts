// Money is integer ngwee as a string (NN-1). Format to ZMW without floats.

export function formatZmw(ngwee: string | number | null | undefined): string {
  if (ngwee === null || ngwee === undefined) return '—';
  const raw = String(ngwee);
  const neg = raw.startsWith('-');
  const digits = (neg ? raw.slice(1) : raw).padStart(3, '0');
  const major = digits.slice(0, -2);
  const minor = digits.slice(-2);
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}.${minor}`;
}

export function zmw(ngwee: string | number | null | undefined): string {
  return `ZMW ${formatZmw(ngwee)}`;
}

export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function initials(value: string): string {
  return value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'IC';
}
