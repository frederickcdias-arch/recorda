/** Aging badge showing time in current stage with blue/gray color coding. */

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  const days = Math.floor(seconds / 86400);
  return `${days}d`;
}

interface AgingBadgeProps {
  segundos: number;
  /** Thresholds in seconds: [warning, critical]. Default: [2 days, 5 days] */
  thresholds?: [number, number];
  className?: string;
}

export function AgingBadge({ segundos, thresholds = [172800, 432000], className = '' }: AgingBadgeProps): JSX.Element {
  const [warn, crit] = thresholds;
  let style: string;
  if (segundos >= crit) {
    style = 'bg-gray-300 text-gray-900 font-semibold';
  } else if (segundos >= warn) {
    style = 'bg-blue-100 text-blue-800';
  } else {
    style = 'bg-gray-50 text-gray-500';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${style} ${className}`} title={`${Math.floor(segundos / 3600)}h na etapa`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      {formatDuration(segundos)}
    </span>
  );
}
