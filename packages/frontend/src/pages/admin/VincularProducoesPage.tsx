import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { PageState } from '../../components/ui/PageState';
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

export function VincularProducoesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<string>('');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<string>('');
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const { data: colaboradores, isLoading: loadingColaboradores } = useQuery({
    queryKey: ['colaboradores-legado'],
    queryFn: () => api.get<ColaboradorLegado[]>('/api/admin/colaboradores-legado'),
  });

  const { data: usuarios, isLoading: loadingUsuarios } = useQuery({
    queryKey: ['usuarios-colaboradores'],
    queryFn: () => api.get<UsuarioColaborador[]>('/api/admin/usuarios-colaboradores'),
  });

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ['preview-vinculacao', colaboradorSelecionado, usuarioSelecionado],
    queryFn: () => 
      api.get<PreviewVinculacao>(
        `/api/admin/preview-vinculacao/${encodeURIComponent(colaboradorSelecionado)}/${usuarioSelecionado}`
      ),
    enabled: mostrarPreview && !!colaboradorSelecionado && !!usuarioSelecionado,
  });

  const vincularMutation = useMutation({
    mutationFn: (data: { colaboradorNomeLegado: string; usuarioId: string }) =>
      api.post('/api/admin/vincular-producoes', data),
    onSuccess: (data: any) => {
      setMensagem({ tipo: 'success', texto: data.mensagem });
      setColaboradorSelecionado('');
      setUsuarioSelecionado('');
      setMostrarPreview(false);
      queryClient.invalidateQueries({ queryKey: ['colaboradores-legado'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios-colaboradores'] });
    },
    onError: (error: any) => {
      setMensagem({ 
        tipo: 'error', 
        texto: error.error || 'Erro ao vincular produções' 
      });
    },
  });

  const handleVisualizarPreview = () => {
    if (colaboradorSelecionado && usuarioSelecionado) {
      setMostrarPreview(true);
    }
  };

  const handleVincular = () => {
    if (colaboradorSelecionado && usuarioSelecionado) {
      vincularMutation.mutate({
        colaboradorNomeLegado: colaboradorSelecionado,
        usuarioId: usuarioSelecionado,
      });
    }
  };

  const loading = loadingColaboradores || loadingUsuarios;

  return (
    <PageState loading={loading} loadingMessage="Carregando dados...">
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Vincular Produções Legadas</h1>
          <p className="mt-1 text-gray-500">
            Vincule produções antigas (importadas) aos usuários colaboradores criados no sistema
          </p>
        </header>

        {mensagem && (
          <div
            className={`rounded-lg p-4 ${
              mensagem.tipo === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                name={mensagem.tipo === 'success' ? 'check-circle' : 'alert-circle'}
                className="w-5 h-5"
              />
              <p className="font-medium">{mensagem.texto}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="users" className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Colaboradores do Sistema Legado
                </h2>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {colaboradores?.map((colab) => (
                  <button
                    key={colab.nome}
                    onClick={() => {
                      setColaboradorSelecionado(colab.nome);
                      setMostrarPreview(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      colaboradorSelecionado === colab.nome
                        ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{colab.nome}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Icon name="clipboard" className="w-3 h-3" />
                        {colab.total_producoes} produções
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="folder" className="w-3 h-3" />
                        {colab.total_repositorios} repositórios
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(colab.primeira_producao).toLocaleDateString('pt-BR')} até{' '}
                      {new Date(colab.ultima_producao).toLocaleDateString('pt-BR')}
                    </p>
                  </button>
                }iv>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="user" className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">Usuários Colaboradores</h2>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {!usuarios || usuarios.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Icon name="user" className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">
                      {loadingUsuarios ? 'Carregando...' : 'Nenhum usuário colaborador cadastrado'}
                    </p>
                    {!loadingUsuarios && (
                      <p className="text-xs mt-1">
                        Crie usuários com perfil "Colaborador" em Configurações → Usuários
                      </p>
                    )}
                  </div>
                ) : (
                  usuarios.map((usuario) => (
                    <button
                    key={usuario.id}
                    onClick={() => {
                      setUsuarioSelecionado(usuario.id);
                      setMostrarPreview(false);
                    }}
                    disabled={!usuario.ativo}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      usuarioSelecionado === usuario.id
                        ? 'bg-green-50 border-green-500 ring-2 ring-green-200'
                        : usuario.ativo
                          ? 'bg-white border-gray-200 hover:bg-gray-50'
                          : 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{usuario.nome}</p>
                        <p className="text-sm text-gray-600">{usuario.email}</p>
                        {usuario.coordenadoria_nome && (
                          <p className="text-xs text-gray-500 mt-1">
                            {usuario.coordenadoria_sigla} - {usuario.coordenadoria_nome}
                          </p>
                    
                )      )}
                        <p className="text-xs text-gray-500 mt-1">
                          {usuario.total_producoes_vinculadas} produções já vinculadas
                        </p>
                      </div>
                      {!usuario.ativo && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {colaboradorSelecionado && usuarioSelecionado && (
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Icon name="link" className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Vinculação Selecionada</h2>
                </div>
                <Button
                  variant="outline"
                  onClick={handleVisualizarPreview}
                  disabled={loadingPreview}
                  className="text-sm"
                >
                  <Icon name="eye" className="w-4 h-4" />
                  {loadingPreview ? 'Carregando...' : 'Visualizar Preview'}
                </Button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Colaborador (Legado):</p>
                  <p className="font-medium text-gray-900">{colaboradorSelecionado}</p>
                </div>
                <Icon name="arrow-down" className="w-4 h-4 text-gray-400 mx-auto" />
                <div>
                  <p className="text-sm text-gray-600">Usuário (Sistema Novo):</p>
                  <p className="font-medium text-gray-900">
                    {usuarios?.find((u) => u.id === usuarioSelecionado)?.nome}
                  </p>
                  <p className="text-sm text-gray-600">
                    {usuarios?.find((u) => u.id === usuarioSelecionado)?.email}
                  </p>
                </div>
              </div>

              {mostrarPreview && preview && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Preview de Vinculação ({preview.totalRegistros} registros)
                  </h3>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Data
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Etapa
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Registros
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Quantidade
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.preview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {new Date(item.data).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">{item.etapa}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right">
                              {item.registros}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right">
                              {item.quantidade_total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <Buttonsd                  disabled={vincularMutation.isPending || !mostrarPreview}
                >
                  <Icon name="link" className="w-4 h-4" />
                  {vincularMutation.isPending ? 'Vinculando...' : 'Confirmar Vinculação'}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </PageState>
  );
}
