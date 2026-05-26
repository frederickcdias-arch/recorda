/** Status badge aligned with the neutral/primary visual hierarchy. */

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  RECEBIDO: {
    bg: 'bg-[var(--color-primary-100)]',
    text: 'text-[var(--color-primary-700)]',
    label: 'Recebido',
  },
  EM_PREPARACAO: {
    bg: 'bg-[var(--color-primary-50)]',
    text: 'text-[var(--color-primary-700)]',
    label: 'Em Preparação',
  },
  EM_DIGITALIZACAO: {
    bg: 'bg-[var(--color-bg-secondary)]',
    text: 'text-[var(--color-text-secondary)]',
    label: 'Em Digitalização',
  },
  EM_CONFERENCIA: {
    bg: 'bg-[var(--color-primary-100)]',
    text: 'text-[var(--color-primary-700)]',
    label: 'Em Conferência',
  },
  EM_MONTAGEM: {
    bg: 'bg-[var(--color-bg-secondary)]',
    text: 'text-[var(--color-text-secondary)]',
    label: 'Em Montagem',
  },
  AGUARDANDO_CQ_LOTE: {
    bg: 'bg-[var(--color-bg-tertiary)]',
    text: 'text-[var(--color-text-secondary)]',
    label: 'Aguardando CQ',
  },
  EM_CQ: {
    bg: 'bg-[var(--color-primary-100)]',
    text: 'text-[var(--color-primary-700)]',
    label: 'Em CQ',
  },
  CQ_REPROVADO: {
    bg: 'bg-[var(--color-bg-tertiary)]',
    text: 'text-[var(--color-text-primary)]',
    label: 'CQ Reprovado',
  },
  EM_ENTREGA: {
    bg: 'bg-[var(--color-primary-50)]',
    text: 'text-[var(--color-primary-700)]',
    label: 'Em Entrega',
  },
  ENTREGUE: {
    bg: 'bg-[var(--color-primary-600)]',
    text: 'text-white',
    label: 'Entregue',
  },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps): JSX.Element {
  const style = STATUS_STYLES[status] ?? {
    bg: 'bg-[var(--color-bg-secondary)]',
    text: 'text-[var(--color-text-secondary)]',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${className}`}
    >
      {style.label}
    </span>
  );
}

export function getStatusLabel(status: string): string {
  return STATUS_STYLES[status]?.label ?? status;
}
