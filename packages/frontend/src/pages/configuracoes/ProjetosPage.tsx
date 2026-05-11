import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { PageHeader } from '../../components/ui/PageHeader';
import { Alert } from '../../components/ui/Alert';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PageState } from '../../components/ui/PageState';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableEmptyState,
} from '../../components/ui/Table';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useProjetosConfiguracao, useCreateProjetoConfiguracao } from '../../hooks/useQueries';

interface ProjetoForm {
  nome: string;
  descricao: string;
  ativo: boolean;
}

export function ProjetosPage(): JSX.Element {
  const projetosQuery = useProjetosConfiguracao();
  const createProjeto = useCreateProjetoConfiguracao();

  const confirmDialog = useConfirmDialog();
  const [formulario, setFormulario] = useState<ProjetoForm>({
    nome: '',
    descricao: '',
    ativo: true,
  });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );

  const projetos = projetosQuery.data ?? [];

  const carregando = projetosQuery.isLoading;

  const resetForm = () => {
    setFormulario({ nome: '', descricao: '', ativo: true });
    setMostrarForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulario.nome.trim()) {
      setMensagem({ tipo: 'error', texto: 'Nome do projeto é obrigatório' });
      return;
    }
    try {
      await createProjeto.mutateAsync({
        nome: formulario.nome.trim(),
        descricao: formulario.descricao.trim() || undefined,
        ativo: formulario.ativo,
      });
      setMensagem({ tipo: 'success', texto: 'Projeto criado com sucesso!' });
      resetForm();
    } catch (error) {
      setMensagem({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'Erro ao salvar projeto',
      });
    }
  };

  const handleExcluir = (projetoId: string): void => {
    const projeto = projetos.find((p) => p.id === projetoId);
    confirmDialog.confirm({
      title: 'Excluir Projeto',
      message: `Tem certeza que deseja excluir o projeto "${projeto?.nome ?? ''}"? Esta ação não poderá ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setMensagem({ tipo: 'error', texto: 'Exclusão de projetos ainda não disponível' });
      },
    });
  };

  return (
    <PageState loading={carregando} loadingMessage="Carregando projetos...">
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Projetos"
          subtitle="Gerencie os projetos do sistema"
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

        {mensagem && (
          <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
            {mensagem.texto}
          </Alert>
        )}

        {/* Formulário */}
        {mostrarForm && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                Novo Projeto
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Nome *"
                  value={formulario.nome}
                  onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                  placeholder="Nome do projeto"
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={formulario.descricao}
                    onChange={(e) => setFormulario({ ...formulario, descricao: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)]"
                    placeholder="Descrição detalhada do projeto"
                    rows={3}
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="ativo"
                    checked={formulario.ativo}
                    onChange={(e) => setFormulario({ ...formulario, ativo: e.target.checked })}
                    className="h-4 w-4 rounded border-[var(--color-border-primary)] text-[var(--color-primary-600)] focus:ring-[var(--color-primary-500)]"
                  />
                  <label
                    htmlFor="ativo"
                    className="ml-2 block text-sm text-[var(--color-text-primary)]"
                  >
                    Projeto ativo
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={createProjeto.isPending}
                    disabled={createProjeto.isPending}
                  >
                    Criar Projeto
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={resetForm}
                    disabled={createProjeto.isPending}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        )}

        {/* Lista de Projetos */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Projetos Cadastrados ({projetos.length})
            </h2>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Nome</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader align="right">Ações</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {projetos.length === 0 ? (
                  <TableEmptyState
                    colSpan={3}
                    title="Nenhum projeto encontrado"
                    description='Clique em "Novo Projeto" para criar o primeiro'
                  />
                ) : (
                  projetos.map((projeto) => (
                    <TableRow key={projeto.id}>
                      <TableCell className="font-medium">{projeto.nome}</TableCell>
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
                          title="Exclusão em desenvolvimento"
                        >
                          Excluir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
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
