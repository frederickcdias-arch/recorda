import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
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
  const isAdmin = usuario?.perfil === 'administrador';

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
    { value: 'DIGITALIZACAO_COLORIDA', label: 'Digitalização Colorida' },
    { value: 'CONFERENCIA', label: 'Conferência' },
    { value: 'RECONFERENCIA', label: 'Reconferência' },
    { value: 'MONTAGEM', label: 'Montagem' },
    { value: 'ATENDIMENTO', label: 'Atendimento' },
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
      toast.success('Órgão / Unidade já existente e selecionado.');
      return;
    }

    try {
      setSalvando(true);
      const created = await createCoordenadoria.mutateAsync(nomeCoordenadoria);
      setFormData((prev) => ({ ...prev, coordenadoria: created.nome.trim().toUpperCase() }));
      setNovaCoordenadoriaInput('');
      toast.success('Órgão / Unidade cadastrado e selecionado com sucesso.');
      if (coordenadoriasQuery.refetch) await coordenadoriasQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cadastrar órgão';
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
        ...(isAdmin && formData.data ? { data: formData.data } : {}),
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
      const apiError = error as { message?: string; error?: string; code?: string };
      let texto: string;
      if (apiError.code === 'PRODUCAO_DUPLICADA') {
        texto = formData.etapa.startsWith('DIGITALIZACAO')
          ? 'Já existe lançamento de digitalização semelhante para este repositório hoje. Verifique antes de lançar novamente.'
          : 'Já existe produção registrada para este repositório nesta etapa hoje. Verifique antes de lançar novamente.';
      } else {
        texto =
          apiError.message ||
          apiError.error ||
          (error instanceof Error ? error.message : null) ||
          'Erro ao registrar produção';
      }
      setMensagem({ tipo: 'error', texto });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PageState>
      <div className="space-y-6">
        <PageHeader
          title="Lançar Produção"
          subtitle={`Registre sua produção diária — ${usuario?.nome ?? ''}`}
        />

        {mensagem && (
          <ActionFeedback
            type={mensagem.tipo}
            title=""
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        )}

        <Card padding="none">
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {isAdmin ? (
                <Input
                  label="Data (ajuste administrativo)"
                  type="date"
                  value={formData.data}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData((p) => ({ ...p, data: e.target.value }))}
                  helperText="Somente administradores podem alterar a data."
                />
              ) : (
                <div>
                  <p className="mb-1 text-sm font-medium text-[var(--color-neutral-700)]">Data</p>
                  <p className="rounded-md border border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm text-[var(--color-neutral-600)]">
                    {new Date().toLocaleDateString('pt-BR')} — definida automaticamente
                  </p>
                </div>
              )}

              <Input
                label="Repositório"
                type="text"
                required
                placeholder="Ex: 179/2025 ou 999"
                value={formData.repositorio}
                onChange={(e) => setFormData((p) => ({ ...p, repositorio: e.target.value }))}
                onBlur={(e) => {
                  const formatted = normalizeIdRepositorioGed(e.target.value);
                  if (formatted) {
                    setFormData((p) => ({ ...p, repositorio: formatted }));
                  }
                }}
                helperText="Digite apenas números (ex: 999) ou formato 999/2025"
              />

              <Select
                label="Etapa"
                required
                value={formData.etapa}
                onChange={(e) => {
                  const selected = etapas.find((item) => item.value === e.target.value);
                  setFormData((p) => ({
                    ...p,
                    etapa: selected?.value ?? '',
                    funcao: selected?.label ?? '',
                  }));
                }}
                placeholder="Selecione a etapa"
              >
                {etapas.map((etapa) => (
                  <option key={etapa.value} value={etapa.value}>
                    {etapa.label}
                  </option>
                ))}
              </Select>

              <div>
                <Select
                  label="Órgão / Unidade"
                  value={formData.coordenadoria}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      coordenadoria: e.target.value.trim().toUpperCase(),
                    }))
                  }
                  placeholder="— Selecione —"
                >
                  {coordenadoriasOptions.map((coordenadoria) => (
                    <option key={coordenadoria.id} value={coordenadoria.nome}>
                      {coordenadoria.nome}
                    </option>
                  ))}
                </Select>
                <div className="mt-2 flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Novo órgão / unidade..."
                      value={novaCoordenadoriaInput}
                      onChange={(e) => setNovaCoordenadoriaInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleCriarCoordenadoriaRapida();
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleCriarCoordenadoriaRapida()}
                    disabled={!novaCoordenadoriaInput.trim() || salvando}
                    title="Adicionar e Selecionar Órgão / Unidade"
                  >
                    Adicionar
                  </Button>
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

              <Select
                label="Tipo"
                value={formData.tipo}
                onChange={(e) => setFormData((p) => ({ ...p, tipo: e.target.value }))}
                placeholder="— Selecione —"
              >
                <option value="Imagens">Imagens</option>
                <option value="Caixas">Caixas</option>
              </Select>
            </div>

            <div className="flex justify-end pt-4">
              <Button variant="primary" onClick={handleSalvar} loading={salvando}>
                Registrar Produção
              </Button>
            </div>
          </div>
        </Card>

        <div className="rounded-lg border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] p-4">
          <h3 className="mb-2 font-semibold text-[var(--color-primary-900)]">Instruções</h3>
          <ul className="space-y-1 text-sm text-[var(--color-primary-800)]">
            <li>
              • <strong>Data:</strong>{' '}
              {isAdmin
                ? 'Administradores podem informar data para correção administrativa. Padrão: hoje.'
                : 'Definida automaticamente como hoje.'}
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
