import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { useUsuarios, useRegisterUsuario, useToggleUsuarioAtivo, useQueryClient, queryKeys } from '../../hooks/useQueries';

interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: string;
  ativo: boolean;
  criado_em: string;
}

export function UsuariosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const usuariosQuery = useUsuarios();
  const registerUsuario = useRegisterUsuario();
  const toggleUsuarioAtivo = useToggleUsuarioAtivo();
  const usuarios = usuariosQuery.data?.usuarios ?? [];
  const carregando = usuariosQuery.isLoading;
  const erro = usuariosQuery.error
    ? { message: 'Erro ao Carregar Usuários', details: usuariosQuery.error instanceof Error ? usuariosQuery.error.message : '' }
    : null;

  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    senha: '',
    perfil: 'operador' as 'operador' | 'administrador',
  });
  const [salvando, setSalvando] = useState(false);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.usuarios });

  const handleSalvar = async () => {
    if (!formData.email || !formData.nome || !formData.senha) {
      setMensagem({ tipo: 'error', texto: 'Preencha todos os campos obrigatórios' });
      return;
    }
    setSalvando(true);
    try {
      await registerUsuario.mutateAsync({
        email: formData.email,
        nome: formData.nome,
        senha: formData.senha,
        perfil: formData.perfil,
      });
      setMensagem({ tipo: 'success', texto: 'Usuário criado!' });
      setModalAberto(false);
      setFormData({ email: '', nome: '', senha: '', perfil: 'operador' });
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { error?: string })?.error || 'Erro';
      setMensagem({ tipo: 'error', texto: message });
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleAtivo = async (usuario: Usuario) => {
    try {
      await toggleUsuarioAtivo.mutateAsync(usuario.id);
      setMensagem({ tipo: 'success', texto: usuario.ativo ? 'Usuário desativado' : 'Usuário ativado' });
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { error?: string })?.error || 'Erro';
      setMensagem({ tipo: 'error', texto: message });
    }
  };

  const erroComAcao = erro ? { ...erro, action: { label: 'Tentar novamente', onClick: invalidate } } : null;

  return (
    <PageState loading={carregando} loadingMessage="Carregando..." error={erroComAcao}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
            <p className="text-gray-500 mt-1">Gerencie os Usuários do sistema</p>
          </div>
          <Button variant="primary" icon="plus" onClick={() => setModalAberto(true)}>Novo Usuário</Button>
        </div>

        {mensagem && <ActionFeedback type={mensagem.tipo} title="" message={mensagem.texto} onDismiss={() => setMensagem(null)} />}

        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Papel</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usuarios.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Icon name="users" className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Nenhum Usuário encontrado</p>
                  </td></tr>
                ) : usuarios.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{u.nome}</td>
                    <td className="px-6 py-4 text-gray-700">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${u.papel === 'ADMIN' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800'}`}>
                        {u.papel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${u.ativo ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleToggleAtivo(u)} className={u.ativo ? 'text-gray-400 hover:text-gray-700' : 'text-blue-600 hover:text-blue-800'}>
                        <Icon name={u.ativo ? 'x' : 'check'} className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {modalAberto && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
              <h3 className="text-lg font-semibold mb-4">Novo Usuário</h3>
              <div className="space-y-4">
                <Input label="Nome" value={formData.nome} onChange={(e) => setFormData(p => ({ ...p, nome: e.target.value }))} />
                <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} />
                <Input label="Senha" type="password" value={formData.senha} onChange={(e) => setFormData(p => ({ ...p, senha: e.target.value }))} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Papel</label>
                  <select
                    value={formData.perfil}
                    onChange={(e) => setFormData(p => ({ ...p, perfil: e.target.value as 'operador' | 'administrador' }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="operador">Operador</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button variant="secondary" onClick={() => setModalAberto(false)}>Cancelar</Button>
                <Button variant="primary" onClick={handleSalvar} loading={salvando}>Criar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageState>
  );
}
