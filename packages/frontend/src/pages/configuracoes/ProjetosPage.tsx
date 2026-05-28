import { useMemo, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FilterBar } from '../../components/ui/FilterBar';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { ActionFeedback, PageState } from '../../components/ui/PageState';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useCreateProjetoConfiguracao, useProjetosConfiguracao } from '../../hooks/useQueries';

interface ProjetoForm {
  nome: string;
  descricao: string;
  ativo: boolean;
}

const initialForm: ProjetoForm = {
  nome: '',
  descricao: '',
  ativo: true,
};

export function ProjetosPage(): JSX.Element {
  const projetosQuery = useProjetosConfiguracao();
  const createProjeto = useCreateProjetoConfiguracao();
  const confirmDialog = useConfirmDialog();

  const [formulario, setFormulario] = useState<ProjetoForm>(initialForm);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busca, setBusca] = useState('');
  const debouncedBusca = useDebounce(busca, 600);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );

  const projetos = useMemo(() => projetosQuery.data ?? [], [projetosQuery.data]);
  const carregando = projetosQuery.isLoading;

  const projetosFiltrados = useMemo(() => {
    const termo = debouncedBusca.trim().toLowerCase();
    if (!termo) return projetos;

    return projetos.filter((projeto) => projeto.nome.toLowerCase().includes(termo));
  }, [debouncedBusca, projetos]);

  const resetForm = (): void => {
    setFormulario(initialForm);
    setMostrarForm(false);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!formulario.nome.trim()) {
      setMensagem({ tipo: 'error', texto: 'Nome do projeto e obrigatorio.' });
      return;
    }

    try {
      await createProjeto.mutateAsync({
        nome: formulario.nome.trim(),
        descricao: formulario.descricao.trim() || undefined,
        ativo: formulario.ativo,
      });
      setMensagem({ tipo: 'success', texto: 'Projeto criado com sucesso.' });
      resetForm();
    } catch (error) {
      setMensagem({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'Erro ao salvar projeto.',
      });
    }
  };

  const handleExcluir = (projetoId: string): void => {
    const projeto = projetos.find((p) => p.id === projetoId);
    confirmDialog.confirm({
      title: 'Excluir projeto',
      message: `Tem certeza que deseja excluir o projeto "${projeto?.nome ?? ''}"? Esta ação não poderá ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setMensagem({ tipo: 'error', texto: 'Exclusão de projetos ainda não disponível.' });
      },
    });
  };

  return (
    <PageState loading={carregando} loadingMessage="Carregando projetos...">
      <div className="space-y-6">
        <PageHeader
          title="Projetos"
          subtitle="Projetos Disponíveis no Sistema."
          actions={
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                resetForm();
                setMostrarForm(true);
              }}
            >
              Novo Projeto
            </Button>
          }
        />

        {mensagem ? (
          <ActionFeedback
            type={mensagem.tipo}
            title={
              mensagem.tipo === 'success' ? 'Atualização Concluída' : 'Não Foi Possível Concluir'
            }
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        ) : null}

        <Card padding="sm" className="bg-[var(--color-bg-secondary)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Projetos{' '}
              <strong className="text-[var(--color-text-primary)]">{projetos.length}</strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Visíveis{' '}
              <strong className="text-[var(--color-text-primary)]">
                {projetosFiltrados.length}
              </strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Status <strong className="text-[var(--color-text-primary)]">Ativo</strong>
            </span>
          </div>
        </Card>

        <FilterBar
          actions={
            busca ? (
              <Button variant="ghost" size="sm" onClick={() => setBusca('')}>
                Limpar
              </Button>
            ) : null
          }
        >
          <Input
            label="Buscar"
            placeholder="Digite o nome do projeto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </FilterBar>

        <Card padding="none">
          <CardHeader
            title="Projetos"
            className="px-5 pt-5"
            badge={<Badge variant="info">{projetosFiltrados.length}</Badge>}
          />

          <Table>
            <TableHead>
              <tr>
                <TableHeader>Projeto</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader align="right">Ações</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {projetosFiltrados.length === 0 ? (
                <TableEmptyState
                  colSpan={3}
                  title={busca ? 'Nenhum projeto encontrado' : 'Nenhum projeto cadastrado'}
                  description={busca ? 'Tente ajustar a busca.' : 'Crie o primeiro projeto.'}
                />
              ) : (
                projetosFiltrados.map((projeto) => (
                  <TableRow key={projeto.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">
                          {projeto.nome}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          Disponível para Vinculação Operacional
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">Ativo</Badge>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        onClick={() => handleExcluir(projeto.id)}
                        disabled
                        title="Exclusão em Desenvolvimento"
                      >
                        Excluir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Modal
          open={mostrarForm}
          onClose={resetForm}
          title="Novo Projeto"
          subtitle="Cadastre um Projeto para Uso Administrativo e Operacional."
          footer={
            <div className="flex flex-col-reverse gap-3 p-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={resetForm}
                disabled={createProjeto.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="novo-projeto-form"
                variant="primary"
                loading={createProjeto.isPending}
                disabled={createProjeto.isPending}
              >
                Criar projeto
              </Button>
            </div>
          }
        >
          <form id="novo-projeto-form" onSubmit={handleSubmit} className="space-y-4 p-5">
            <Input
              label="Nome *"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              placeholder="Nome do projeto"
              required
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                Descricao
              </label>
              <textarea
                value={formulario.descricao}
                onChange={(e) => setFormulario({ ...formulario, descricao: e.target.value })}
                className="min-h-[110px] w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] transition-colors duration-150 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-100)]"
                placeholder="Descrição detalhada do projeto"
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
              <input
                type="checkbox"
                id="ativo"
                checked={formulario.ativo}
                onChange={(e) => setFormulario({ ...formulario, ativo: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-primary)] text-[var(--color-primary-600)] focus:ring-[var(--color-primary-500)]"
              />
              <div>
                <span className="font-medium text-[var(--color-text-primary)]">Projeto ativo</span>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  O projeto fica disponível imediatamente para uso no sistema.
                </p>
              </div>
            </label>
          </form>
        </Modal>

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />
      </div>
    </PageState>
  );
}
