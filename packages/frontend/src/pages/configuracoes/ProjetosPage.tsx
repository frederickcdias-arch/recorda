import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { PageState } from '../../components/ui/PageState';
import { useProjetosConfiguracao, useCreateProjetoConfiguracao } from '../../hooks/useQueries';

interface Projeto {
  id: string;
  nome: string;
}

interface ProjetoForm {
  nome: string;
  descricao: string;
  ativo: boolean;
}

export function ProjetosPage(): JSX.Element {
  const projetosQuery = useProjetosConfiguracao();
  const createProjeto = useCreateProjetoConfiguracao();

  const [editando, setEditando] = useState<string | null>(null);
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
    setFormulario({
      nome: '',
      descricao: '',
      ativo: true,
    });
    setEditando(null);
    setMostrarForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulario.nome.trim()) {
      setMensagem({ tipo: 'error', texto: 'Nome do projeto é obrigatório' });
      return;
    }

    try {
      if (editando) {
        // TODO: Implementar edição quando tiver endpoint
        setMensagem({ tipo: 'error', texto: 'Edição de projetos ainda não implementada' });
      } else {
        await createProjeto.mutateAsync({
          nome: formulario.nome.trim(),
          descricao: formulario.descricao.trim() || undefined,
          ativo: formulario.ativo,
        });
        setMensagem({ tipo: 'success', texto: 'Projeto criado com sucesso!' });
        resetForm();
      }
    } catch (error) {
      setMensagem({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'Erro ao salvar projeto',
      });
    }
  };

  const handleEditar = (projeto: Projeto) => {
    setFormulario({
      nome: projeto.nome,
      descricao: '',
      ativo: true,
    });
    setEditando(projeto.id);
    setMostrarForm(true);
  };

  const handleToggleAtivo = () => {
    // TODO: Implementar toggle quando tiver endpoint
    setMensagem({ tipo: 'error', texto: 'Toggle de projetos ainda não implementado' });
  };

  const handleExcluir = async (projetoId: string) => {
    const projeto = projetos.find((p) => p.id === projetoId);
    if (!confirm(`Tem certeza que deseja excluir o projeto "${projeto?.nome}"?`)) {
      return;
    }
    // TODO: Implementar exclusão quando tiver endpoint
    setMensagem({ tipo: 'error', texto: 'Exclusão de projetos ainda não implementada' });
  };

  return (
    <PageState loading={carregando} loadingMessage="Carregando projetos...">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
            <p className="text-gray-500 mt-1">Gerencie os projetos do sistema</p>
          </div>
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
        </div>

        {mensagem && (
          <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
            {mensagem.texto}
          </Alert>
        )}

        {/* Formulário */}
        {mostrarForm && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {editando ? 'Editar Projeto' : 'Novo Projeto'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={formulario.nome}
                    onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Nome do projeto"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea
                    value={formulario.descricao}
                    onChange={(e) => setFormulario({ ...formulario, descricao: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900">
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
                    {editando ? 'Atualizar' : 'Criar'} Projeto
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Projetos Cadastrados ({projetos.length})
            </h2>

            {projetos.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Icon name="folder" className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Nenhum projeto encontrado</p>
                <p className="text-sm">Clique em &quot;Novo Projeto&quot; para criar o primeiro</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nome
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projetos.map((projeto) => (
                      <tr key={projeto.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{projeto.nome}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500">-</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Ativo
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              icon="edit"
                              onClick={() => handleEditar(projeto)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              icon={'pause'}
                              onClick={() => handleToggleAtivo()}
                            >
                              Desativar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              icon="trash"
                              onClick={() => handleExcluir(projeto.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageState>
  );
}
