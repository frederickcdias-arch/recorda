import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { ActionFeedback, PageState } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { api } from '../../services/api';

interface ColaboradorLegado {
  nome: string;
  total_producoes: number;
  primeira_producao: string;
  ultima_producao: string;
  total_repositorios: number;
  etapas: string[];
}

interface UsuarioColaborador {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  total_producoes_vinculadas: number;
  coordenadoria_nome: string | null;
  coordenadoria_sigla: string | null;
}

interface PreviewVinculacao {
  colaboradorLegado: string;
  usuario: { nome: string; email: string } | null;
  preview: Array<{
    data: string;
    etapa: string;
    registros: number;
    quantidade_total: number;
    repositorios: string[];
  }>;
  totalRegistros: number;
}

interface VincularProducoesResponse {
  mensagem: string;
}

function SelectableCard({
  selected,
  disabled = false,
  onClick,
  title,
  subtitle,
  meta,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-[var(--color-primary-400)] bg-[var(--color-primary-50)] ring-2 ring-[var(--color-primary-100)]'
          : disabled
            ? 'cursor-not-allowed border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] opacity-60'
            : 'border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-gray-50)]'
      }`}
    >
      <p className="font-medium text-[var(--color-text-primary)]">{title}</p>
      {subtitle ? (
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
      ) : null}
      {meta ? <div className="mt-3 text-xs text-[var(--color-text-tertiary)]">{meta}</div> : null}
    </button>
  );
}

export function VincularProducoesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<string>('');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<string>('');
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );

  const {
    data: colaboradores,
    isLoading: loadingColaboradores,
    error: erroColaboradores,
  } = useQuery({
    queryKey: ['colaboradores-legado'],
    queryFn: () => api.get<ColaboradorLegado[]>('/admin/colaboradores-legado'),
  });

  const {
    data: usuarios,
    isLoading: loadingUsuarios,
    error: erroUsuarios,
  } = useQuery({
    queryKey: ['usuarios-colaboradores'],
    queryFn: () => api.get<UsuarioColaborador[]>('/admin/usuarios-colaboradores'),
  });

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ['preview-vinculacao', colaboradorSelecionado, usuarioSelecionado],
    queryFn: () =>
      api.get<PreviewVinculacao>(
        `/admin/preview-vinculacao/${encodeURIComponent(colaboradorSelecionado)}/${usuarioSelecionado}`
      ),
    enabled: mostrarPreview && !!colaboradorSelecionado && !!usuarioSelecionado,
  });

  const vincularMutation = useMutation({
    mutationFn: (data: { colaboradorNomeLegado: string; usuarioId: string }) =>
      api.post<VincularProducoesResponse>('/admin/vincular-producoes', data),
    onSuccess: (data: VincularProducoesResponse): void => {
      setMensagem({ tipo: 'success', texto: data.mensagem });
      setColaboradorSelecionado('');
      setUsuarioSelecionado('');
      setMostrarPreview(false);
      void queryClient.invalidateQueries({ queryKey: ['colaboradores-legado'] });
      void queryClient.invalidateQueries({ queryKey: ['usuarios-colaboradores'] });
    },
    onError: (error: { error?: string }): void => {
      setMensagem({
        tipo: 'error',
        texto: error.error || 'Erro ao vincular produções.',
      });
    },
  });

  const handleVisualizarPreview = (): void => {
    if (colaboradorSelecionado && usuarioSelecionado) {
      setMostrarPreview(true);
    }
  };

  const handleVincular = (): void => {
    if (colaboradorSelecionado && usuarioSelecionado) {
      vincularMutation.mutate({
        colaboradorNomeLegado: colaboradorSelecionado,
        usuarioId: usuarioSelecionado,
      });
    }
  };

  const loading = loadingColaboradores || loadingUsuarios;
  const usuarioEscolhido = usuarios?.find((u) => u.id === usuarioSelecionado);

  return (
    <PageState loading={loading} loadingMessage="Carregando dados para vinculação...">
      <div className="space-y-6">
        <PageHeader
          title="Vincular produções"
          subtitle="Associe produções legadas a usuários colaboradores já cadastrados no sistema."
        />

        {mensagem ? (
          <ActionFeedback
            type={mensagem.tipo}
            title={
              mensagem.tipo === 'success' ? 'Vinculação concluída' : 'Não foi possível concluir'
            }
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Colaboradores do sistema legado"
              description="Selecione o nome importado que ainda precisa ser vinculado."
            />

            <div className="space-y-2">
              {erroColaboradores ? (
                <div className="rounded-2xl border border-[var(--color-error-200)] bg-[var(--color-error-50)] p-4 text-sm text-[var(--color-error-700)]">
                  Erro ao carregar colaboradores. Recarregue a página para tentar novamente.
                </div>
              ) : !colaboradores || colaboradores.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6 text-center">
                  <Icon
                    name="users"
                    className="mx-auto mb-2 h-10 w-10 text-[var(--color-text-tertiary)]"
                  />
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {loadingColaboradores
                      ? 'Carregando...'
                      : 'Nenhum colaborador encontrado no sistema legado.'}
                  </p>
                </div>
              ) : (
                colaboradores.map((colab) => (
                  <SelectableCard
                    key={colab.nome}
                    selected={colaboradorSelecionado === colab.nome}
                    onClick={() => {
                      setColaboradorSelecionado(
                        colab.nome === colaboradorSelecionado ? '' : colab.nome
                      );
                      setMostrarPreview(false);
                    }}
                    title={colab.nome}
                    subtitle={`${colab.total_producoes} produções • ${colab.total_repositorios} repositórios`}
                    meta={
                      <>
                        {new Date(colab.primeira_producao).toLocaleDateString('pt-BR')} até{' '}
                        {new Date(colab.ultima_producao).toLocaleDateString('pt-BR')}
                      </>
                    }
                  />
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Usuários colaboradores"
              description="Selecione o usuário que deve receber o histórico de produção legado."
            />

            <div className="space-y-2">
              {erroUsuarios ? (
                <div className="rounded-2xl border border-[var(--color-error-200)] bg-[var(--color-error-50)] p-4 text-sm text-[var(--color-error-700)]">
                  Erro ao carregar usuários. Recarregue a página para tentar novamente.
                </div>
              ) : !usuarios || usuarios.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6 text-center">
                  <Icon
                    name="user"
                    className="mx-auto mb-2 h-10 w-10 text-[var(--color-text-tertiary)]"
                  />
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {loadingUsuarios ? 'Carregando...' : 'Nenhum usuário colaborador cadastrado.'}
                  </p>
                </div>
              ) : (
                usuarios.map((usuario) => (
                  <SelectableCard
                    key={usuario.id}
                    selected={usuarioSelecionado === usuario.id}
                    disabled={!usuario.ativo}
                    onClick={() => {
                      setUsuarioSelecionado(usuario.id === usuarioSelecionado ? '' : usuario.id);
                      setMostrarPreview(false);
                    }}
                    title={usuario.nome}
                    subtitle={usuario.email}
                    meta={
                      <>
                        {usuario.coordenadoria_nome
                          ? `${usuario.coordenadoria_sigla} - ${usuario.coordenadoria_nome} • `
                          : ''}
                        {usuario.total_producoes_vinculadas} produções já vinculadas
                        {!usuario.ativo ? ' • Usuário inativo' : ''}
                      </>
                    }
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        {colaboradorSelecionado && usuarioSelecionado ? (
          <Card>
            <CardHeader
              title="Vinculação selecionada"
              description="Confira o mapeamento antes de confirmar a importação do histórico."
              action={
                <Button
                  variant="outline"
                  onClick={handleVisualizarPreview}
                  disabled={loadingPreview}
                  icon="eye"
                >
                  {loadingPreview ? 'Carregando...' : 'Visualizar prévia'}
                </Button>
              }
            />

            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Colaborador legado
                </p>
                <p className="mt-2 font-medium text-[var(--color-text-primary)]">
                  {colaboradorSelecionado}
                </p>
              </div>
              <div className="flex items-center justify-center">
                <Icon
                  name="arrow-down"
                  className="h-5 w-5 rotate-[-90deg] text-[var(--color-text-tertiary)] md:rotate-0"
                />
              </div>
              <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Usuário destino
                </p>
                <p className="mt-2 font-medium text-[var(--color-text-primary)]">
                  {usuarioEscolhido?.nome}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {usuarioEscolhido?.email}
                </p>
              </div>
            </div>

            {mostrarPreview && preview ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Prévia da vinculação
                  </h3>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {preview.totalRegistros} registros
                  </span>
                </div>

                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>Data</TableHeader>
                      <TableHeader>Etapa</TableHeader>
                      <TableHeader align="right">Registros</TableHeader>
                      <TableHeader align="right">Quantidade</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {preview.preview.map((item, idx) => (
                      <TableRow key={`${item.data}-${item.etapa}-${idx}`}>
                        <TableCell>{new Date(item.data).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>{item.etapa}</TableCell>
                        <TableCell align="right">{item.registros}</TableCell>
                        <TableCell align="right">{item.quantidade_total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <Button
                variant="primary"
                onClick={handleVincular}
                disabled={vincularMutation.isPending || !mostrarPreview}
                icon="link"
                loading={vincularMutation.isPending}
              >
                Confirmar vínculo
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </PageState>
  );
}
