import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import {
  useQueryClient,
  useOrgaosRecebimento,
  useCriarOrgaoRecebimento,
} from '../../hooks/useQueries';
import { useToastHelpers } from '../../components/ui/Toast';
import { normalizeIdRepositorioGed } from '@recorda/shared';

function validarQuantidade(value: string): number | null {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function LancarProducaoPage(): JSX.Element {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastHelpers();
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);
  const [novaCoordenadoriaInput, setNovaCoordenadoriaInput] = useState('');
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    repositorio: '',
    etapa: '',
    funcao: '',
    coordenadoria: '',
    quantidade: '',
    tipo: '',
  });

  const coordenadoriasQuery = useOrgaosRecebimento();
  const createCoordenadoria = useCriarOrgaoRecebimento();
  const coordenadoriasOptions = coordenadoriasQuery.data ?? [];

  const etapas = [
    { value: 'RECEBIMENTO', label: 'Recebimento' },
    { value: 'PREPARACAO', label: 'Preparação' },
    { value: 'DIGITALIZACAO', label: 'Digitalização P/B' },
    { value: 'DIGITALIZACAO', label: 'Digitalização Colorida' },
    { value: 'CONFERENCIA', label: 'Conferência' },
    { value: 'RECONFERENCIA', label: 'Reconferência' },
    { value: 'MONTAGEM', label: 'Montagem' },
    { value: 'CONTROLE_QUALIDADE', label: 'Controle de Qualidade' },
    { value: 'ENTREGA', label: 'Entrega' },
  ];

  const handleCriarCoordenadoriaRapida = async () => {
    const nomeCoordenadoria = novaCoordenadoriaInput.trim().toUpperCase();
    if (!nomeCoordenadoria) return;

    const existente = coordenadoriasOptions.find(
      (c) => c.nome.trim().toLowerCase() === nomeCoordenadoria.toLowerCase()
    );
    if (existente) {
      setFormData((prev) => ({ ...prev, coordenadoria: existente.nome.trim().toUpperCase() }));
      setNovaCoordenadoriaInput('');
      toast.success('Coordenadoria já existente e selecionada.');
      return;
    }

    try {
      setSalvando(true);
      const created = await createCoordenadoria.mutateAsync(nomeCoordenadoria);
      setFormData((prev) => ({ ...prev, coordenadoria: created.nome.trim().toUpperCase() }));
      setNovaCoordenadoriaInput('');
      toast.success('Coordenadoria cadastrada e selecionada com sucesso.');
      if (coordenadoriasQuery.refetch) await coordenadoriasQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cadastrar coordenadoria';
      toast.error(message);
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvar = async () => {
    if (!formData.repositorio || !formData.etapa) {
      setMensagem({ tipo: 'error', texto: 'Repositório e Etapa são obrigatórios' });
      return;
    }

    const quantidade = validarQuantidade(formData.quantidade);
    if (quantidade === null) {
      setMensagem({ tipo: 'error', texto: 'Informe uma quantidade inteira maior que zero.' });
      return;
    }

    setSalvando(true);
    try {
      await api.post('/producao/lancar-direto', {
        data: formData.data,
        repositorio: formData.repositorio,
        etapa: formData.etapa,
        funcao: formData.funcao || undefined,
        coordenadoria: formData.coordenadoria.trim().toUpperCase() || undefined,
        quantidade,
        tipo: formData.tipo || undefined,
      });

      setMensagem({ tipo: 'success', texto: 'Produção registrada com sucesso!' });
      setFormData({
        data: new Date().toISOString().split('T')[0],
        repositorio: '',
        etapa: '',
        funcao: '',
        coordenadoria: '',
        quantidade: '',
        tipo: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['meu-historico'] });
    } catch (error) {
      const apiError = error as { message?: string; error?: string };
      const texto =
        apiError.message ||
        apiError.error ||
        (error instanceof Error ? error.message : null) ||
        'Erro ao registrar produção';
      setMensagem({ tipo: 'error', texto });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PageState>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lançar Produção</h1>
          <p className="text-gray-500 mt-1">Registre sua produção diária - {usuario?.nome}</p>
        </div>

        {mensagem && (
          <ActionFeedback
            type={mensagem.tipo}
            title=""
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        )}

        <Card>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Data"
                type="date"
                value={formData.data}
                onChange={(e) => setFormData((p) => ({ ...p, data: e.target.value }))}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Repositório <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: 179/2025 ou 999"
                  value={formData.repositorio}
                  onChange={(e) => setFormData((p) => ({ ...p, repositorio: e.target.value }))}
                  onBlur={(e) => {
                    const formatted = normalizeIdRepositorioGed(e.target.value);
                    if (formatted) {
                      setFormData((p) => ({ ...p, repositorio: formatted }));
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Digite apenas números (ex: 999) ou formato 999/2025
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Etapa <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.funcao}
                  onChange={(e) => {
                    const selected = etapas.find((item) => item.label === e.target.value);
                    setFormData((p) => ({
                      ...p,
                      etapa: selected?.value ?? '',
                      funcao: selected?.label ?? '',
                    }));
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione a etapa</option>
                  {etapas.map((etapa) => (
                    <option key={etapa.label} value={etapa.label}>
                      {etapa.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coordenadoria
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={formData.coordenadoria}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      coordenadoria: e.target.value.trim().toUpperCase(),
                    }))
                  }
                >
                  <option value="">— Selecione —</option>
                  {coordenadoriasOptions.map((coordenadoria) => (
                    <option key={coordenadoria.id} value={coordenadoria.nome}>
                      {coordenadoria.nome}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1 mt-1">
                  <input
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    placeholder="Nova coordenadoria..."
                    value={novaCoordenadoriaInput}
                    onChange={(e) => setNovaCoordenadoriaInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCriarCoordenadoriaRapida();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    onClick={() => void handleCriarCoordenadoriaRapida()}
                    disabled={!novaCoordenadoriaInput.trim() || salvando}
                    title="Adicionar e selecionar coordenadoria"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <Input
                label="Quantidade"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                inputSize="lg"
                required
                value={formData.quantidade}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    quantidade: e.target.value.replace(/\D/g, ''),
                  }))
                }
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={formData.tipo}
                  onChange={(e) => setFormData((p) => ({ ...p, tipo: e.target.value }))}
                >
                  <option value="">— Selecione —</option>
                  <option value="Imagens">Imagens</option>
                  <option value="Caixas">Caixas</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button variant="primary" onClick={handleSalvar} loading={salvando}>
                Registrar Produção
              </Button>
            </div>
          </div>
        </Card>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📋 Instruções</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • <strong>Data:</strong> Data da produção (padrão: hoje)
            </li>
            <li>
              • <strong>Repositório:</strong> ID do repositório trabalhado (obrigatório)
            </li>
            <li>
              • <strong>Etapa:</strong> Etapa do fluxo de trabalho (obrigatório)
            </li>
            <li>
              • <strong>Coordenadoria:</strong> Unidade/coordenadoria responsável
            </li>
            <li>
              • <strong>Quantidade:</strong> Número de itens processados
            </li>
            <li>
              • <strong>Tipo:</strong> Informação adicional (opcional)
            </li>
            <li>• Consulte seu histórico em &quot;Meu Histórico&quot;</li>
          </ul>
        </div>
      </div>
    </PageState>
  );
}
