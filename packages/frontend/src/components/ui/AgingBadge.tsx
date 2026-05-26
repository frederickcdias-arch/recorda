/** Aging badge showing time in current stage with neutral/primary progression. */

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  const days = Math.floor(seconds / 86400);
  return `${days}d`;
}

interface AgingBadgeProps {
  segundos: number;
  thresholds?: [number, number];
  className?: string;
}

export function AgingBadge({
  segundos,
  thresholds = [172800, 432000],
  className = '',
}: AgingBadgeProps): JSX.Element {
  const [warn, crit] = thresholds;
  let style: string;

  if (segundos >= crit) {
    style =
      'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border-primary)]';
  } else if (segundos >= warn) {
    style = 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]';
  } else {
    style = 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${style} ${className}`}
      title={`${Math.floor(segundos / 3600)}h na etapa`}
    >
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      {formatDuration(segundos)}
    </span>
  );
}
