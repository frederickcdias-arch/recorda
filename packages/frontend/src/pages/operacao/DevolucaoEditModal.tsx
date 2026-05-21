import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { useToastHelpers } from '../../components/ui/Toast';
import {
  type DevolucaoOperacional,
  useCoordenadestinoOpcoes,
  useEditarDevolucao,
  useResponsaveisRetiradaOpcoes,
} from '../../hooks/useQueries';

interface CoordComboboxProps {
  value: string;
  onChange: (value: string) => void;
  opcoes: string[];
  required?: boolean;
}

function CoordCombobox({ value, onChange, opcoes, required }: CoordComboboxProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? opcoes.filter((opcao) => opcao.toLowerCase().includes(query.toLowerCase()))
    : opcoes;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
        Coordenadoria Destino
        {required && <span className="ml-0.5 text-[var(--color-error-500)]">*</span>}
      </label>
      <input
        type="text"
        className="h-11 w-full rounded-lg border border-[var(--color-gray-300)] bg-[var(--color-bg-primary)] px-3.5 text-sm text-[var(--color-text-primary)] transition-all duration-150 placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-100)] sm:h-9"
        placeholder="Digite ou selecione a coordenadoria..."
        value={open ? query : value}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-lg">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)] ${
                opt === value
                  ? 'bg-[var(--color-primary-50)] font-medium text-[var(--color-primary-700)]'
                  : ''
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(opt);
                setQuery('');
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface DevolucaoEditModalProps {
  devolucao: DevolucaoOperacional;
  onClose: () => void;
  onSaved: () => void;
}

export function DevolucaoEditModal({
  devolucao,
  onClose,
  onSaved,
}: DevolucaoEditModalProps): JSX.Element {
  const toast = useToastHelpers();
  const coordOpcoes = useCoordenadestinoOpcoes();
  const respOpcoes = useResponsaveisRetiradaOpcoes();
  const editarMut = useEditarDevolucao();

  const [dataDevolucao, setDataDevolucao] = useState(
    String(devolucao.data_devolucao).split('T')[0] ?? ''
  );
  const [coordenadoriaDestino, setCoordenadoriaDestino] = useState(devolucao.coordenadoria_destino);
  const [responsavelRetirada, setResponsavelRetirada] = useState(devolucao.responsavel_retirada);
  const [observacoes, setObservacoes] = useState(devolucao.observacoes ?? '');

  const opcoesCoordenadorias = coordOpcoes.data ?? [];
  const opcoesResponsaveis = respOpcoes.data ?? [];

  const handleSalvar = async () => {
    if (!dataDevolucao) {
      toast.error('Data é obrigatória');
      return;
    }
    if (!coordenadoriaDestino.trim()) {
      toast.error('Coordenadoria destino é obrigatória');
      return;
    }
    if (!responsavelRetirada.trim()) {
      toast.error('Responsável pela retirada é obrigatório');
      return;
    }

    try {
      await editarMut.mutateAsync({
        id: devolucao.id,
        dataDevolucao,
        coordenadoriaDestino: coordenadoriaDestino.trim(),
        responsavelRetirada: responsavelRetirada.trim(),
        observacoes: observacoes.trim() || undefined,
      });
      toast.success('Devolução atualizada com sucesso!');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar devolução');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl bg-[var(--color-bg-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-base font-semibold text-gray-900">Editar Devolução</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Fechar"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Input
            label="Data da Devolução"
            type="date"
            value={dataDevolucao}
            max={new Date().toISOString().split('T')[0]}
            onChange={(event) => setDataDevolucao(event.target.value)}
            required
          />
          <CoordCombobox
            value={coordenadoriaDestino}
            onChange={setCoordenadoriaDestino}
            opcoes={opcoesCoordenadorias}
            required
          />
          <div>
            <Input
              label="Responsável pela Retirada"
              value={responsavelRetirada}
              onChange={(event) => setResponsavelRetirada(event.target.value)}
              placeholder="Nome de quem retirou os documentos"
              required
              list="editar-responsaveis-list"
            />
            <datalist id="editar-responsaveis-list">
              {opcoesResponsaveis.map((responsavel) => (
                <option key={responsavel} value={responsavel} />
              ))}
            </datalist>
          </div>
          <Input
            label="Observações"
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="flex justify-end gap-3 rounded-b-xl border-t bg-gray-50 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={editarMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSalvar()}
            disabled={editarMut.isPending}
          >
            {editarMut.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>
    </div>
  );
}
