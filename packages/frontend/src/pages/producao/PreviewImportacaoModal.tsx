import { Button } from '../../components/ui/Button';
import { formatDateBR } from '../../utils/date';

interface PreviewImportacao {
  totalRegistros: number;
  registrosValidos: number;
  duplicadasPlanilha: number[];
  duplicadasBanco: number[];
  linhasInvalidas: { linha: number; erro: string }[];
  amostraDatas: Array<{
    linha: number;
    dataOriginal: string;
    dataNormalizada: string | null;
    status: 'valido' | 'invalido';
    erro?: string;
  }>;
  impacto: {
    inseridosPrevistos: number;
    atualizadosPrevistos: number;
    ignoradosPrevistos: number;
    invalidos: number;
  };
}

interface PreviewImportacaoModalProps {
  preview: PreviewImportacao;
  processando: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function PreviewImportacaoModal({
  preview,
  processando,
  onConfirm,
  onClose,
}: PreviewImportacaoModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="mx-4 w-full max-w-lg animate-scale-in rounded-xl bg-[var(--color-bg-primary)] p-6 shadow-xl">
        <h3 className="mb-3 text-lg font-bold text-gray-900">Preview de importacao</h3>
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>{preview.totalRegistros}</strong> registros na planilha.
            <strong className="text-gray-900"> {preview.registrosValidos}</strong> validos.
          </p>
          <p className="text-xs text-gray-600">
            Insercoes: <strong>{preview.impacto.inseridosPrevistos}</strong> · Atualizacoes:{' '}
            <strong>{preview.impacto.atualizadosPrevistos}</strong> · Ignorados:{' '}
            <strong>{preview.impacto.ignoradosPrevistos}</strong> · Invalidos:{' '}
            <strong>{preview.impacto.invalidos}</strong>
          </p>
          {preview.duplicadasPlanilha.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700">Duplicadas na planilha:</p>
              <p className="max-h-24 overflow-y-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs">
                Linhas: {preview.duplicadasPlanilha.join(', ')}
              </p>
            </div>
          )}
          {preview.duplicadasBanco.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700">Ja existentes no sistema:</p>
              <p className="max-h-24 overflow-y-auto rounded bg-[var(--color-primary-50)] p-2 font-mono text-xs">
                Linhas: {preview.duplicadasBanco.join(', ')}
              </p>
            </div>
          )}
          {preview.linhasInvalidas.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700">Linhas invalidas:</p>
              <p className="max-h-24 overflow-y-auto rounded bg-red-50 p-2 font-mono text-xs">
                {preview.linhasInvalidas
                  .slice(0, 10)
                  .map((item) => `${item.linha}: ${item.erro}`)
                  .join(' | ')}
              </p>
            </div>
          )}
          {preview.amostraDatas.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700">Amostra da normalizacao das datas:</p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded bg-gray-50 p-2 text-xs">
                {preview.amostraDatas.slice(0, 8).map((item) => (
                  <div
                    key={`${item.status}-${item.linha}`}
                    className="border-b border-gray-100 pb-2 last:border-0 last:pb-0"
                  >
                    <p className="font-mono text-gray-700">Linha {item.linha}</p>
                    <p className="text-gray-600">
                      Planilha: <strong>{item.dataOriginal || '-'}</strong>
                    </p>
                    <p className={item.status === 'valido' ? 'text-green-700' : 'text-red-700'}>
                      Sistema:{' '}
                      <strong>
                        {item.dataNormalizada ? formatDateBR(item.dataNormalizada) : '-'}
                      </strong>
                      {item.erro ? ` | ${item.erro}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          {preview.registrosValidos > 0 && (
            <Button onClick={onConfirm} loading={processando}>
              Confirmar importacao ({preview.registrosValidos})
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
