/** Status badge with blue/gray color palette (60/30/10 rule). */

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  // Recebimento
  RECEBIDO: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Recebido' },
  // Preparação
  EM_PREPARACAO: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Em Preparação' },
  // Digitalização
  EM_DIGITALIZACAO: { bg: 'bg-sky-100', text: 'text-sky-800', label: 'Em Digitalização' },
  // Conferência
  EM_CONFERENCIA: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Em Conferência' },
  // Montagem
  EM_MONTAGEM: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Em Montagem' },
  // CQ
  AGUARDANDO_CQ_LOTE: { bg: 'bg-gray-200', text: 'text-gray-800', label: 'Aguardando CQ' },
  EM_CQ: { bg: 'bg-blue-200', text: 'text-blue-900', label: 'Em CQ' },
  CQ_REPROVADO: { bg: 'bg-gray-300', text: 'text-gray-900', label: 'CQ Reprovado' },
  // Entrega
  EM_ENTREGA: { bg: 'bg-sky-50', text: 'text-sky-700', label: 'Em Entrega' },
  ENTREGUE: { bg: 'bg-blue-600', text: 'text-white', label: 'Entregue' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps): JSX.Element {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} ${className}`}>
      {style.label}
    </span>
  );
}

export function getStatusLabel(status: string): string {
  return STATUS_STYLES[status]?.label ?? status;
}
