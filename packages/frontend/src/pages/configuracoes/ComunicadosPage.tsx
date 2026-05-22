import { useMemo, useState } from 'react';
import type {
  ComunicadoAdminResumo,
  ComunicadoEscopoDestino,
  ComunicadoPrioridade,
  ComunicadoStatus,
  PublicarComunicadoDTO,
} from '@recorda/shared';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToastHelpers } from '../../components/ui/Toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import {
  useComunicadosAdmin,
  useComunicadoAdminDetalhe,
  useCriarComunicado,
  useEncerrarComunicado,
  useExcluirComunicado,
  usePublicarComunicado,
  useUsuarios,
} from '../../hooks/useQueries';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateTimeBR } from '../../utils/date';

type FormState = {
  titulo: string;
  conteudo: string;
  prioridade: ComunicadoPrioridade;
  escopoDestino: ComunicadoEscopoDestino;
  usuarioIds: string[];
};

type FiltroStatus = 'TODOS' | ComunicadoStatus;
type FiltroEscopo = 'QUALQUER' | ComunicadoEscopoDestino;
type FiltroOrdenacao = 'mais-recentes' | 'mais-antigos' | 'mais-pendentes' | 'mais-lidos';
type FiltroLeituraDetalhe = 'todos' | 'pendentes' | 'lidos';
type FiltroPrioridade = 'TODAS' | ComunicadoPrioridade;

const initialFormState: FormState = {
  titulo: '',
  conteudo: '',
  prioridade: 'MEDIA',
  escopoDestino: 'TODOS',
  usuarioIds: [],
};
const ITENS_POR_PAGINA = 10;

function getPrioridadeBadge(prioridade: ComunicadoPrioridade): string {
  switch (prioridade) {
    case 'ALTA':
      return 'bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-200)]';
    case 'MEDIA':
      return 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-200)]';
    default:
      return 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-200)]';
  }
}

function getStatusBadge(status: ComunicadoAdminResumo['status']): string {
  switch (status) {
    case 'PUBLICADO':
      return 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-200)]';
    case 'ENCERRADO':
      return 'bg-[var(--color-gray-100)] text-[var(--color-gray-700)] border-[var(--color-gray-200)]';
    default:
      return 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-200)]';
  }
}

function getEscopoLabel(escopo: ComunicadoEscopoDestino): string {
  return escopo === 'TODOS' ? 'Todos os usuários ativos' : 'Usuários específicos';
}

function getStatusLabel(status: ComunicadoAdminResumo['status']): string {
  switch (status) {
    case 'PUBLICADO':
      return 'Publicado';
    case 'ENCERRADO':
      return 'Encerrado';
    default:
      return 'Rascunho';
  }
}

function toCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function ComunicadosPage(): JSX.Element {
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();
  const [modalAberto, setModalAberto] = useState(false);
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [publicandoDraft, setPublicandoDraft] = useState<ComunicadoAdminResumo | null>(null);
  const [detalheAbertoId, setDetalheAbertoId] = useState<string | null>(null);
  const [draftUsuarioIds, setDraftUsuarioIds] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [filtroEscopo, setFiltroEscopo] = useState<FiltroEscopo>('QUALQUER');
  const [filtroPrioridade, setFiltroPrioridade] = useState<FiltroPrioridade>('TODAS');
  const [ordenacao, setOrdenacao] = useState<FiltroOrdenacao>('mais-recentes');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [dataPublicacaoExata, setDataPublicacaoExata] = useState('');
  const [paginaHistorico, setPaginaHistorico] = useState(1);
  const [filtroLeituraDetalhe, setFiltroLeituraDetalhe] = useState<FiltroLeituraDetalhe>('todos');
  const [buscaDestinatario, setBuscaDestinatario] = useState('');
  const comunicadosQuery = useComunicadosAdmin({
    pagina: paginaHistorico,
    limite: ITENS_POR_PAGINA,
    busca: busca || undefined,
    status: filtroStatus,
    escopo: filtroEscopo,
    prioridade: filtroPrioridade,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    publicadoEm: dataPublicacaoExata || undefined,
    ordenacao,
  });
  const usuariosQuery = useUsuarios();
  const criarComunicado = useCriarComunicado();
  const publicarComunicado = usePublicarComunicado();
  const encerrarComunicado = useEncerrarComunicado();
  const excluirComunicado = useExcluirComunicado();
  const detalheQuery = useComunicadoAdminDetalhe(detalheAbertoId);

  const usuariosAtivos = useMemo(
    () => (usuariosQuery.data?.usuarios ?? []).filter((usuario) => usuario.ativo),
    [usuariosQuery.data]
  );
  const comunicados = comunicadosQuery.data?.comunicados ?? [];
  const totalPaginasHistorico = comunicadosQuery.data?.totalPaginas ?? 1;
  const paginaHistoricoAtual = comunicadosQuery.data?.pagina ?? paginaHistorico;
  const destinatariosDetalhe = useMemo(
    () => detalheQuery.data?.comunicado.destinatarios ?? [],
    [detalheQuery.data]
  );
  const destinatariosFiltrados = useMemo(() => {
    const termo = buscaDestinatario.trim().toLowerCase();
    return destinatariosDetalhe.filter((item) => {
      if (filtroLeituraDetalhe === 'pendentes' && item.destinatario.lidoEm !== null) return false;
      if (filtroLeituraDetalhe === 'lidos' && item.destinatario.lidoEm === null) return false;
      if (!termo) return true;
      return (
        item.usuarioNome.toLowerCase().includes(termo) ||
        item.usuarioEmail.toLowerCase().includes(termo)
      );
    });
  }, [buscaDestinatario, destinatariosDetalhe, filtroLeituraDetalhe]);
  const resumo = comunicadosQuery.data?.resumo;
  const rascunhos = resumo?.rascunhos ?? 0;
  const publicados = resumo?.publicados ?? 0;
  const naoLidos = resumo?.pendenciasLeitura ?? 0;
  const comunicadosAlta = resumo?.prioridadeAlta ?? 0;
  const comunicadosMedia = resumo?.prioridadeMedia ?? 0;
  const comunicadosBaixa = resumo?.prioridadeBaixa ?? 0;

  const resetFormulario = (): void => {
    setFormData(initialFormState);
  };

  const validarFormulario = (state: FormState): string | null => {
    if (!state.titulo.trim()) return 'Informe o título do comunicado.';
    if (state.titulo.trim().length < 3) return 'O título deve ter ao menos 3 caracteres.';
    if (!state.conteudo.trim()) return 'Informe o conteúdo do comunicado.';
    if (state.escopoDestino === 'USUARIOS_ESPECIFICOS' && state.usuarioIds.length === 0) {
      return 'Selecione ao menos um usuário para o envio direcionado.';
    }
    return null;
  };

  const toggleUsuario = (usuarioId: string): void => {
    setFormData((current) => ({
      ...current,
      usuarioIds: current.usuarioIds.includes(usuarioId)
        ? current.usuarioIds.filter((id) => id !== usuarioId)
        : [...current.usuarioIds, usuarioId],
    }));
  };

  const toggleDraftUsuario = (usuarioId: string): void => {
    setDraftUsuarioIds((current) =>
      current.includes(usuarioId)
        ? current.filter((id) => id !== usuarioId)
        : [...current, usuarioId]
    );
  };

  const handleCriar = async (publicarAgora: boolean): Promise<void> => {
    const erroValidacao = validarFormulario(formData);
    if (erroValidacao) {
      toast.warning('Formulário incompleto', erroValidacao);
      return;
    }

    try {
      const created = await criarComunicado.mutateAsync({
        titulo: formData.titulo.trim(),
        conteudo: formData.conteudo.trim(),
        prioridade: formData.prioridade,
        escopoDestino: formData.escopoDestino,
      });

      const comunicadoId = created.comunicado.id;
      const publishBody: PublicarComunicadoDTO | undefined =
        formData.escopoDestino === 'USUARIOS_ESPECIFICOS'
          ? { usuarioIds: formData.usuarioIds }
          : undefined;

      if (publicarAgora) {
        try {
          const publishResult = await publicarComunicado.mutateAsync({
            id: comunicadoId,
            body: publishBody,
          });
          toast.success(
            'Comunicado publicado',
            `${publishResult.totalDestinatarios} destinatário(s) receberam o comunicado.`
          );
        } catch (error) {
          toast.error(
            'Rascunho criado, mas a publicação falhou',
            extractErrorMessage(error, 'Não foi possível publicar o comunicado agora.')
          );
        }
      } else {
        toast.success('Rascunho salvo', 'O comunicado foi salvo e pode ser publicado depois.');
      }

      setModalAberto(false);
      resetFormulario();
    } catch (error) {
      toast.error('Erro ao salvar comunicado', extractErrorMessage(error, 'Tente novamente.'));
    }
  };

  const abrirPublicacao = (comunicado: ComunicadoAdminResumo): void => {
    setPublicandoDraft(comunicado);
    setDraftUsuarioIds([]);
  };

  const confirmarPublicacaoDraft = async (): Promise<void> => {
    if (!publicandoDraft) return;
    if (publicandoDraft.escopoDestino === 'USUARIOS_ESPECIFICOS' && draftUsuarioIds.length === 0) {
      toast.warning('Selecione destinatários', 'Escolha ao menos um usuário para publicar.');
      return;
    }

    try {
      const result = await publicarComunicado.mutateAsync({
        id: publicandoDraft.id,
        body:
          publicandoDraft.escopoDestino === 'USUARIOS_ESPECIFICOS'
            ? { usuarioIds: draftUsuarioIds }
            : undefined,
      });
      toast.success(
        'Comunicado publicado',
        `${result.totalDestinatarios} destinatário(s) receberam o comunicado.`
      );
      setPublicandoDraft(null);
      setDraftUsuarioIds([]);
    } catch (error) {
      toast.error('Erro ao publicar', extractErrorMessage(error, 'Tente novamente.'));
    }
  };

  const handleEncerrar = (comunicado: ComunicadoAdminResumo): void => {
    confirmDialog.confirm({
      title: 'Encerrar comunicado',
      message: `Deseja encerrar "${comunicado.titulo}"? Ele deixará de aparecer como ativo para os usuários.`,
      confirmLabel: 'Encerrar',
      variant: 'warning',
      onConfirm: async () => {
        await encerrarComunicado.mutateAsync(comunicado.id);
        toast.success('Comunicado encerrado');
      },
    });
  };

  const handleExcluir = (comunicado: ComunicadoAdminResumo): void => {
    confirmDialog.confirm({
      title: 'Excluir comunicado',
      message: `Deseja excluir "${comunicado.titulo}"? Esta ação removerá o comunicado e os destinatários vinculados e não poderá ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        const result = await excluirComunicado.mutateAsync(comunicado.id);
        if (detalheAbertoId === comunicado.id) {
          setDetalheAbertoId(null);
        }
        toast.success(
          'Comunicado excluído',
          `${result.destinatariosRemovidos} destinatário(s) removidos.`
        );
      },
    });
  };

  const abrirDetalhe = (comunicadoId: string): void => {
    setFiltroLeituraDetalhe('todos');
    setBuscaDestinatario('');
    setDetalheAbertoId(comunicadoId);
  };

  const duplicarComunicado = (comunicado: ComunicadoAdminResumo): void => {
    setFormData({
      titulo: `${comunicado.titulo} (cópia)`,
      conteudo: comunicado.conteudo,
      prioridade: comunicado.prioridade,
      escopoDestino: comunicado.escopoDestino,
      usuarioIds: [],
    });
    setModalAberto(true);
  };

  const totalPendentesDetalhe = Math.max(
    (detalheQuery.data?.comunicado.totalDestinatarios ?? 0) -
      (detalheQuery.data?.comunicado.totalLidos ?? 0),
    0
  );
  const taxaLeituraDetalhe =
    (detalheQuery.data?.comunicado.totalDestinatarios ?? 0) > 0
      ? Math.round(
          ((detalheQuery.data?.comunicado.totalLidos ?? 0) /
            (detalheQuery.data?.comunicado.totalDestinatarios ?? 1)) *
            100
        )
      : 0;

  const handleCopiarEmails = async (apenasPendentes: boolean): Promise<void> => {
    const base = apenasPendentes
      ? destinatariosFiltrados.filter((item) => item.destinatario.lidoEm === null)
      : destinatariosFiltrados;
    const emails = base.map((item) => item.usuarioEmail).filter(Boolean);

    if (emails.length === 0) {
      toast.warning('Nenhum e-mail encontrado', 'Não existem destinatários neste filtro.');
      return;
    }

    try {
      await navigator.clipboard.writeText(emails.join('; '));
      toast.success(
        apenasPendentes ? 'Emails pendentes copiados' : 'Emails copiados',
        `${emails.length} e-mail(s) copiados para a área de transferência.`
      );
    } catch {
      toast.error('Falha ao copiar e-mails', 'Não foi possível acessar a área de transferência.');
    }
  };

  const handleExportarCsv = (): void => {
    if (!detalheQuery.data?.comunicado || destinatariosFiltrados.length === 0) {
      toast.warning('Nada para exportar', 'Não existem destinatários neste filtro.');
      return;
    }

    const linhas = [
      ['nome', 'email', 'status_leitura', 'usuario_ativo', 'entregue_em', 'lido_em'],
      ...destinatariosFiltrados.map((item) => [
        item.usuarioNome,
        item.usuarioEmail,
        item.destinatario.lidoEm ? 'LIDO' : 'PENDENTE',
        item.usuarioAtivo ? 'SIM' : 'NAO',
        formatDateTimeBR(item.destinatario.entregueEm),
        item.destinatario.lidoEm ? formatDateTimeBR(item.destinatario.lidoEm) : '',
      ]),
    ];

    const csv = linhas
      .map((linha) => linha.map((coluna) => toCsvCell(coluna)).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const titulo = detalheQuery.data.comunicado.titulo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    anchor.href = url;
    anchor.download = `comunicado-${titulo || detalheQuery.data.comunicado.id}-${filtroLeituraDetalhe}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    toast.success('CSV exportado', `${destinatariosFiltrados.length} destinatário(s) exportados.`);
  };

  const handleExportarHistoricoCsv = async (): Promise<void> => {
    if ((resumo?.totalFiltrados ?? 0) === 0) {
      toast.warning('Nada para exportar', 'Não existem comunicados neste filtro.');
      return;
    }

    try {
      const qs = new URLSearchParams();
      const params = {
        pagina: 1,
        limite: 100,
        busca,
        status: filtroStatus,
        escopo: filtroEscopo,
        prioridade: filtroPrioridade,
        dataInicio,
        dataFim,
        publicadoEm: dataPublicacaoExata,
        ordenacao,
      };

      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        qs.set(key, String(value));
      }

      await api.download(`/admin/comunicados/exportar?${qs.toString()}`);
      toast.success(
        'Histórico exportado',
        `${resumo?.totalFiltrados ?? 0} comunicado(s) enviados para download.`
      );
    } catch (error) {
      toast.error(
        'Falha ao exportar histórico',
        extractErrorMessage(error, 'Não foi possível gerar o arquivo agora.')
      );
    }
  };

  const carregando = comunicadosQuery.isLoading || usuariosQuery.isLoading;
  const erro = comunicadosQuery.error ?? usuariosQuery.error;

  return (
    <PageState
      loading={carregando}
      loadingMessage="Carregando comunicados..."
      error={
        erro
          ? {
              message: 'Não foi possível carregar a gestão de comunicados.',
              details: extractErrorMessage(erro, 'Tente novamente em instantes.'),
              action: {
                label: 'Atualizar',
                onClick: (): void => {
                  void comunicadosQuery.refetch();
                  void usuariosQuery.refetch();
                },
              },
            }
          : null
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Gestão de Comunicados"
          subtitle="Crie, publique e acompanhe comunicados internos."
          actions={
            <>
              <Button variant="ghost" icon="download" onClick={handleExportarHistoricoCsv}>
                Exportar histórico
              </Button>
              <Button
                variant="secondary"
                icon="refresh-cw"
                onClick={() => void comunicadosQuery.refetch()}
              >
                Atualizar
              </Button>
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  resetFormulario();
                  setModalAberto(true);
                }}
              >
                Novo comunicado
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">Rascunhos</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">{rascunhos}</p>
              <Icon name="edit" className="h-7 w-7 text-[var(--color-primary-600)]" />
            </div>
          </Card>
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">Publicados</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">{publicados}</p>
              <Icon name="mail" className="h-7 w-7 text-[var(--color-success-600)]" />
            </div>
          </Card>
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">Leituras pendentes</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">{naoLidos}</p>
              <Icon name="alert-triangle" className="h-7 w-7 text-[var(--color-warning-600)]" />
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Histórico operacional
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Consulte envios, datas e prioridade.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--color-error-200)] bg-[var(--color-error-50)] px-3 py-1 text-sm font-medium text-[var(--color-error-700)]">
                Alta: {comunicadosAlta}
              </span>
              <span className="rounded-full border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] px-3 py-1 text-sm font-medium text-[var(--color-warning-700)]">
                Média: {comunicadosMedia}
              </span>
              <span className="rounded-full border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] px-3 py-1 text-sm font-medium text-[var(--color-primary-700)]">
                Baixa: {comunicadosBaixa}
              </span>
              <span className="rounded-full border border-[var(--color-gray-200)] bg-[var(--color-gray-100)] px-3 py-1 text-sm font-medium text-[var(--color-gray-700)]">
                Filtrados: {resumo?.totalFiltrados ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-8">
            <Input
              label="Buscar"
              value={busca}
              onChange={(event) => {
                setBusca(event.target.value);
                setPaginaHistorico(1);
              }}
              placeholder="Título ou conteúdo"
            />
            <Select
              label="Status"
              value={filtroStatus}
              onChange={(event) => {
                setFiltroStatus(event.target.value as FiltroStatus);
                setPaginaHistorico(1);
              }}
              options={[
                { value: 'TODOS', label: 'Todos' },
                { value: 'RASCUNHO', label: 'Rascunho' },
                { value: 'PUBLICADO', label: 'Publicado' },
                { value: 'ENCERRADO', label: 'Encerrado' },
              ]}
            />
            <Select
              label="Escopo"
              value={filtroEscopo}
              onChange={(event) => {
                setFiltroEscopo(event.target.value as FiltroEscopo);
                setPaginaHistorico(1);
              }}
              options={[
                { value: 'QUALQUER', label: 'Todos' },
                { value: 'TODOS', label: 'Todos os usuários ativos' },
                { value: 'USUARIOS_ESPECIFICOS', label: 'Usuários específicos' },
              ]}
            />
            <Select
              label="Prioridade"
              value={filtroPrioridade}
              onChange={(event) => {
                setFiltroPrioridade(event.target.value as FiltroPrioridade);
                setPaginaHistorico(1);
              }}
              options={[
                { value: 'TODAS', label: 'Todas' },
                { value: 'ALTA', label: 'Alta' },
                { value: 'MEDIA', label: 'Média' },
                { value: 'BAIXA', label: 'Baixa' },
              ]}
            />
            <Select
              label="Ordenação"
              value={ordenacao}
              onChange={(event) => {
                setOrdenacao(event.target.value as FiltroOrdenacao);
                setPaginaHistorico(1);
              }}
              options={[
                { value: 'mais-recentes', label: 'Mais recentes' },
                { value: 'mais-antigos', label: 'Mais antigos' },
                { value: 'mais-pendentes', label: 'Mais pendentes' },
                { value: 'mais-lidos', label: 'Mais lidos' },
              ]}
            />
            <Input
              label="Data Início"
              type="date"
              value={dataInicio}
              onChange={(event) => {
                setDataInicio(event.target.value);
                setPaginaHistorico(1);
              }}
            />
            <Input
              label="Data Final"
              type="date"
              value={dataFim}
              onChange={(event) => {
                setDataFim(event.target.value);
                setPaginaHistorico(1);
              }}
            />
            <Input
              label="Publicado em"
              type="date"
              value={dataPublicacaoExata}
              onChange={(event) => {
                setDataPublicacaoExata(event.target.value);
                setPaginaHistorico(1);
              }}
            />
            <div className="flex items-end">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setBusca('');
                  setFiltroStatus('TODOS');
                  setFiltroEscopo('QUALQUER');
                  setFiltroPrioridade('TODAS');
                  setOrdenacao('mais-recentes');
                  setDataInicio('');
                  setDataFim('');
                  setDataPublicacaoExata('');
                  setPaginaHistorico(1);
                }}
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </Card>

        {comunicados.length === 0 ? (
          <Card className="text-center">
            <Icon name="mail" className="mx-auto h-12 w-12 text-[var(--color-gray-300)]" />
            <h2 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              Nenhum comunicado encontrado
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Ajuste os filtros ou crie o primeiro comunicado para publicar orientações no sistema.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {comunicados.map((comunicado) => {
              const totalPendentes = Math.max(
                comunicado.totalDestinatarios - comunicado.totalLidos,
                0
              );

              return (
                <Card key={comunicado.id}>
                  <CardHeader
                    title={comunicado.titulo}
                    description={`Criado em ${formatDateTimeBR(comunicado.criadoEm)}`}
                    badge={
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(comunicado.prioridade)}`}
                        >
                          {comunicado.prioridade}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadge(comunicado.status)}`}
                        >
                          {getStatusLabel(comunicado.status)}
                        </span>
                      </div>
                    }
                    action={
                      <div className="flex flex-wrap justify-end gap-2">
                        {comunicado.status !== 'RASCUNHO' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirDetalhe(comunicado.id)}
                          >
                            Acompanhar
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicarComunicado(comunicado)}
                        >
                          Duplicar
                        </Button>
                        {comunicado.status === 'RASCUNHO' ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => abrirPublicacao(comunicado)}
                          >
                            Publicar
                          </Button>
                        ) : null}
                        {comunicado.status === 'PUBLICADO' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEncerrar(comunicado)}
                          >
                            Encerrar
                          </Button>
                        ) : null}
                        {comunicado.status !== 'PUBLICADO' ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleExcluir(comunicado)}
                          >
                            Excluir
                          </Button>
                        ) : null}
                      </div>
                    }
                  />

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div className="rounded-lg bg-[var(--color-gray-50)] p-3">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          Escopo
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                          {getEscopoLabel(comunicado.escopoDestino)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--color-gray-50)] p-3">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          Destinatários
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                          {comunicado.totalDestinatarios}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--color-gray-50)] p-3">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          Leituras
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                          {comunicado.totalLidos}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--color-gray-50)] p-3">
                        <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          Pendentes
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                          {totalPendentes}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">
                        {comunicado.conteudo}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-secondary)]">
                      {comunicado.publicadoEm ? (
                        <span>Publicado em {formatDateTimeBR(comunicado.publicadoEm)}</span>
                      ) : (
                        <span>Aguardando publicação</span>
                      )}
                      {comunicado.encerradoEm ? (
                        <span>Encerrado em {formatDateTimeBR(comunicado.encerradoEm)}</span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
            <Pagination
              pagina={paginaHistoricoAtual}
              totalPaginas={totalPaginasHistorico}
              onChange={setPaginaHistorico}
            />
          </div>
        )}

        <Modal
          open={modalAberto}
          onClose={() => setModalAberto(false)}
          title="Novo comunicado"
          subtitle="Crie um rascunho ou publique agora."
          size="xl"
          footer={
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                loading={criarComunicado.isPending}
                onClick={() => void handleCriar(false)}
              >
                Salvar rascunho
              </Button>
              <Button
                variant="primary"
                loading={criarComunicado.isPending || publicarComunicado.isPending}
                onClick={() => void handleCriar(true)}
              >
                Salvar e publicar
              </Button>
            </div>
          }
        >
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Título"
                value={formData.titulo}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, titulo: event.target.value }))
                }
                placeholder="Ex: Ajuste no fluxo de recebimento"
              />
              <Select
                label="Prioridade"
                value={formData.prioridade}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    prioridade: event.target.value as ComunicadoPrioridade,
                  }))
                }
                options={[
                  { value: 'BAIXA', label: 'Baixa' },
                  { value: 'MEDIA', label: 'Média' },
                  { value: 'ALTA', label: 'Alta' },
                ]}
              />
            </div>

            <Select
              label="Escopo de envio"
              value={formData.escopoDestino}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  escopoDestino: event.target.value as ComunicadoEscopoDestino,
                  usuarioIds: event.target.value === 'TODOS' ? [] : current.usuarioIds,
                }))
              }
              options={[
                { value: 'TODOS', label: 'Todos os usuários ativos' },
                { value: 'USUARIOS_ESPECIFICOS', label: 'Usuários específicos' },
              ]}
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                Conteúdo
              </label>
              <textarea
                value={formData.conteudo}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, conteudo: event.target.value }))
                }
                rows={8}
                placeholder="Escreva o conteúdo do comunicado."
                className="w-full rounded-lg border border-[var(--color-gray-300)] bg-[var(--color-bg-primary)] px-3.5 py-3 text-sm text-[var(--color-text-primary)] transition-all duration-150 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-100)]"
              />
            </div>

            {formData.escopoDestino === 'USUARIOS_ESPECIFICOS' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                      Destinatários específicos
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Selecione os usuários ativos que devem receber este comunicado.
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--color-primary-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary-700)]">
                    {formData.usuarioIds.length} selecionado(s)
                  </span>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[var(--color-border-primary)] p-3">
                  {usuariosAtivos.map((usuario) => {
                    const selecionado = formData.usuarioIds.includes(usuario.id);
                    return (
                      <label
                        key={usuario.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          selecionado
                            ? 'border-[var(--color-primary-300)] bg-[var(--color-primary-50)]'
                            : 'border-[var(--color-border-primary)] hover:bg-[var(--color-gray-50)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={() => toggleUsuario(usuario.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">
                            {usuario.nome}
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {usuario.email}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </Modal>

        <Modal
          open={publicandoDraft !== null}
          onClose={() => {
            setPublicandoDraft(null);
            setDraftUsuarioIds([]);
          }}
          title="Publicar comunicado"
          subtitle={publicandoDraft?.titulo}
          size="lg"
          footer={
            <div className="flex justify-end gap-3 p-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setPublicandoDraft(null);
                  setDraftUsuarioIds([]);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={publicarComunicado.isPending}
                onClick={() => void confirmarPublicacaoDraft()}
              >
                Confirmar publicação
              </Button>
            </div>
          }
        >
          <div className="space-y-4 p-5">
            <Card variant="ghost">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Escopo selecionado:{' '}
                {publicandoDraft?.escopoDestino && getEscopoLabel(publicandoDraft.escopoDestino)}
              </p>
            </Card>

            {publicandoDraft?.escopoDestino === 'USUARIOS_ESPECIFICOS' ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Selecione os usuários ativos que devem receber este rascunho.
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[var(--color-border-primary)] p-3">
                  {usuariosAtivos.map((usuario) => {
                    const selecionado = draftUsuarioIds.includes(usuario.id);
                    return (
                      <label
                        key={usuario.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          selecionado
                            ? 'border-[var(--color-primary-300)] bg-[var(--color-primary-50)]'
                            : 'border-[var(--color-border-primary)] hover:bg-[var(--color-gray-50)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={() => toggleDraftUsuario(usuario.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">
                            {usuario.nome}
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {usuario.email}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Este comunicado será expandido para todos os usuários ativos no momento da
                publicação.
              </p>
            )}
          </div>
        </Modal>

        <Modal
          open={detalheAbertoId !== null}
          onClose={() => setDetalheAbertoId(null)}
          title="Acompanhamento do comunicado"
          subtitle={detalheQuery.data?.comunicado.titulo}
          size="xl"
          footer={
            <div className="flex justify-end p-4">
              <Button variant="secondary" onClick={() => setDetalheAbertoId(null)}>
                Fechar
              </Button>
            </div>
          }
        >
          <div className="space-y-5 p-5">
            {detalheQuery.isLoading ? (
              <div className="py-10 text-center text-sm text-[var(--color-text-secondary)]">
                Carregando destinatários...
              </div>
            ) : detalheQuery.error ? (
              <Card className="text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {extractErrorMessage(
                    detalheQuery.error,
                    'Não foi possível carregar o acompanhamento deste comunicado.'
                  )}
                </p>
              </Card>
            ) : detalheQuery.data?.comunicado ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <Card>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      Destinatários
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
                      {detalheQuery.data.comunicado.totalDestinatarios}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      Leituras
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
                      {detalheQuery.data.comunicado.totalLidos}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      Pendentes
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
                      {totalPendentesDetalhe}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      Escopo
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      {getEscopoLabel(detalheQuery.data.comunicado.escopoDestino)}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
                      Taxa de leitura
                    </p>
                    <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
                      {taxaLeituraDetalhe}%
                    </p>
                  </Card>
                </div>

                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                        Destinatários
                      </h3>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Consulte quem já leu e quem ainda está pendente.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={filtroLeituraDetalhe === 'todos' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setFiltroLeituraDetalhe('todos')}
                      >
                        Todos ({destinatariosDetalhe.length})
                      </Button>
                      <Button
                        variant={filtroLeituraDetalhe === 'pendentes' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setFiltroLeituraDetalhe('pendentes')}
                      >
                        Pendentes ({totalPendentesDetalhe})
                      </Button>
                      <Button
                        variant={filtroLeituraDetalhe === 'lidos' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setFiltroLeituraDetalhe('lidos')}
                      >
                        Lidos ({detalheQuery.data.comunicado.totalLidos})
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Input
                      label="Buscar destinatário"
                      value={buscaDestinatario}
                      onChange={(event) => setBuscaDestinatario(event.target.value)}
                      placeholder="Nome ou email"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCopiarEmails(false)}
                    >
                      Copiar emails
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleCopiarEmails(true)}>
                      Copiar pendentes
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleExportarCsv}>
                      Exportar CSV
                    </Button>
                  </div>
                </Card>

                {destinatariosFiltrados.length === 0 ? (
                  <Card className="text-center">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Nenhum destinatário encontrado para este filtro.
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {destinatariosFiltrados.map((item) => {
                      const pendente = item.destinatario.lidoEm === null;
                      return (
                        <Card key={item.destinatario.id}>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                  {item.usuarioNome}
                                </p>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    pendente
                                      ? 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]'
                                      : 'bg-[var(--color-success-50)] text-[var(--color-success-700)]'
                                  }`}
                                >
                                  {pendente ? 'Pendente' : 'Lido'}
                                </span>
                                {!item.usuarioAtivo ? (
                                  <span className="rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-gray-700)]">
                                    Usuário inativo
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                {item.usuarioEmail}
                              </p>
                            </div>

                            <div className="text-xs text-[var(--color-text-secondary)] sm:text-right">
                              <p>Entregue em {formatDateTimeBR(item.destinatario.entregueEm)}</p>
                              <p>
                                {item.destinatario.lidoEm
                                  ? `Lido em ${formatDateTimeBR(item.destinatario.lidoEm)}`
                                  : 'Aguardando leitura'}
                              </p>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </Modal>

        <ConfirmDialog
          state={confirmDialog.state}
          loading={
            confirmDialog.loading || encerrarComunicado.isPending || excluirComunicado.isPending
          }
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />
      </div>
    </PageState>
  );
}
