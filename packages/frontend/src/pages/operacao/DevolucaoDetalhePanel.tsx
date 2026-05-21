import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToastHelpers } from '../../components/ui/Toast';
import { api } from '../../services/api';
import { useDevolucaoDetalhe } from '../../hooks/useQueries';

function formatarData(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = String(value).split('T')[0]?.split('-');
  if (!parts || parts.length < 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

interface DevolucaoDetalhePanelProps {
  devolucaoId: string;
  onClose: () => void;
}

export function DevolucaoDetalhePanel({
  devolucaoId,
  onClose,
}: DevolucaoDetalhePanelProps): JSX.Element {
  const detalheQuery = useDevolucaoDetalhe(devolucaoId);
  const toast = useToastHelpers();
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      setBaixandoPdf(true);
      const response = await api.fetchWithAuth(`/operacional/devolucoes/${devolucaoId}/pdf`);
      if (!response.ok) throw new Error('Erro ao gerar PDF');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `termo_devolucao_${devolucaoId.slice(0, 8)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não foi possível baixar o PDF');
    } finally {
      setBaixandoPdf(false);
    }
  };

  if (detalheQuery.isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-xl bg-[var(--color-bg-primary)] p-8 text-[var(--color-text-secondary)]">
          Carregando...
        </div>
      </div>
    );
  }

  const { devolucao, itens } = detalheQuery.data ?? { devolucao: null, itens: [] };
  if (!devolucao) return <></>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-[var(--color-bg-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Devolução — {devolucao.coordenadoria_destino}
            </h2>
            <p className="text-sm text-gray-500">
              {formatarData(devolucao.data_devolucao)} · {devolucao.responsavel_retirada}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Fechar"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {devolucao.observacoes && (
            <p className="mb-4 text-sm italic text-gray-600">{devolucao.observacoes}</p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Protocolo</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Interessado</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Repositório</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Vol.</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, index) => (
                <tr
                  key={item.id}
                  className={
                    index % 2 === 0
                      ? 'bg-[var(--color-bg-primary)]'
                      : 'bg-[var(--color-bg-secondary)]'
                  }
                >
                  <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                  <td className="px-3 py-2">{item.protocolo || '—'}</td>
                  <td className="max-w-[140px] truncate px-3 py-2">{item.interessado || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{item.repositorio || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{item.volume || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{item.obs || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownloadPdf()}
            disabled={baixandoPdf}
          >
            {baixandoPdf ? 'Gerando PDF...' : 'Baixar PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
