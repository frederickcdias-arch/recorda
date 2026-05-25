import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
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

  const { devolucao, itens } = detalheQuery.data ?? { devolucao: null, itens: [] };

  return (
    <Modal
      open
      onClose={onClose}
      title={devolucao ? `Devolução - ${devolucao.coordenadoria_destino}` : 'Detalhes da devolução'}
      subtitle={
        devolucao
          ? `${formatarData(devolucao.data_devolucao)} • ${devolucao.responsavel_retirada}`
          : detalheQuery.isLoading
            ? 'Carregando detalhes...'
            : 'Detalhes da devolução'
      }
      size="xl"
      footer={
        <div className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} fullWidth>
            Fechar
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleDownloadPdf()}
            disabled={baixandoPdf || detalheQuery.isLoading || !devolucao}
            fullWidth
          >
            {baixandoPdf ? 'Gerando PDF...' : 'Baixar PDF'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        {detalheQuery.isLoading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Carregando detalhes...</p>
        ) : !devolucao ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Não foi possível carregar a devolução.
          </p>
        ) : (
          <>
            {devolucao.observacoes ? (
              <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Observações
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {devolucao.observacoes}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {itens.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4 shadow-xs lg:hidden"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                        Item {index + 1}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                        {item.protocolo || '—'}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--color-gray-100)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                      {item.volume || '—'}
                    </span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-[var(--color-text-tertiary)]">Interessado</dt>
                      <dd className="text-[var(--color-text-primary)]">{item.interessado || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-text-tertiary)]">Repositório</dt>
                      <dd className="text-[var(--color-text-primary)]">{item.repositorio || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-text-tertiary)]">Observações</dt>
                      <dd className="text-[var(--color-text-primary)]">{item.obs || '—'}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="hidden lg:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>#</TableHeader>
                    <TableHeader>Protocolo</TableHeader>
                    <TableHeader>Interessado</TableHeader>
                    <TableHeader>Repositório</TableHeader>
                    <TableHeader>Vol.</TableHeader>
                    <TableHeader>Obs.</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itens.length === 0 ? (
                    <TableEmptyState
                      colSpan={6}
                      title="Nenhum item vinculado"
                      description="Esta devolução não possui itens cadastrados."
                    />
                  ) : (
                    itens.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-[var(--color-text-tertiary)]">{index + 1}</TableCell>
                        <TableCell>{item.protocolo || '—'}</TableCell>
                        <TableCell>{item.interessado || '—'}</TableCell>
                        <TableCell>{item.repositorio || '—'}</TableCell>
                        <TableCell>{item.volume || '—'}</TableCell>
                        <TableCell className="text-[var(--color-text-secondary)]">
                          {item.obs || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
