import { useMemo, useState } from 'react';
import type { PerfilUsuario } from '@recorda/shared';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
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
import {
  queryKeys,
  useQueryClient,
  useRegisterUsuario,
  useToggleUsuarioAtivo,
  useUpdateUsuario,
  useUsuarios,
} from '../../hooks/useQueries';

interface Usuario {
  id: string;
  email: string;
  nome: string;
  perfis: PerfilUsuario[];
  perfilAtivo: PerfilUsuario;
  papel: string;
  ativo: boolean;
  criado_em: string;
}

const PERFIL_OPTIONS = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'operador', label: 'Operador' },
  { value: 'visualizador', label: 'Visualizador' },
  { value: 'administrador', label: 'Administrador' },
] as const satisfies ReadonlyArray<{ value: PerfilUsuario; label: string }>;

function formatarPapel(papel: string): string {
  if (papel === 'ADMIN') return 'Administrador';
  if (papel === 'VISUALIZADOR') return 'Visualizador';
  return papel.charAt(0).toUpperCase() + papel.slice(1).toLowerCase();
}

function getPerfilBadgeClass(papel: string): string {
  if (papel === 'ADMIN') {
    return 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]';
  }

  if (papel === 'VISUALIZADOR') {
    return 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]';
  }

  return 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]';
}

function togglePerfilSelecionado(
  perfisAtuais: PerfilUsuario[],
  perfil: PerfilUsuario,
  checked: boolean
): PerfilUsuario[] {
  if (checked) {
    return perfisAtuais.includes(perfil) ? perfisAtuais : [...perfisAtuais, perfil];
  }

  return perfisAtuais.filter((item) => item !== perfil);
}

export function UsuariosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const usuariosQuery = useUsuarios();
  const registerUsuario = useRegisterUsuario();
  const updateUsuario = useUpdateUsuario();
  const toggleUsuarioAtivo = useToggleUsuarioAtivo();
  const usuarios = useMemo(() => usuariosQuery.data?.usuarios ?? [], [usuariosQuery.data]);
  const carregando = usuariosQuery.isLoading;
  const erro = usuariosQuery.error
    ? {
        message: 'Erro ao carregar usuários',
        details: usuariosQuery.error instanceof Error ? usuariosQuery.error.message : '',
      }
    : null;

  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    senha: '',
    perfis: ['operador'] as PerfilUsuario[],
  });
  const [salvando, setSalvando] = useState(false);

  const resumo = useMemo(
    () => ({
      total: usuarios.length,
      ativos: usuarios.filter((usuario) => usuario.ativo).length,
      admins: usuarios.filter((usuario) => usuario.papel === 'ADMIN').length,
    }),
    [usuarios]
  );

  const invalidate = (): void =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.usuarios });

  const handleAbrirModalNovo = (): void => {
    setUsuarioEditando(null);
    setFormData({ email: '', nome: '', senha: '', perfis: ['operador'] });
    setModalAberto(true);
  };

  const handleAbrirModalEditar = (usuario: Usuario): void => {
    setUsuarioEditando(usuario);
    setFormData({
      email: usuario.email,
      nome: usuario.nome,
      senha: '',
      perfis: usuario.perfis,
    });
    setModalAberto(true);
  };

  const handleSalvar = async (): Promise<void> => {
    if (
      !formData.email ||
      !formData.nome ||
      formData.perfis.length === 0 ||
      (!usuarioEditando && !formData.senha)
    ) {
      setMensagem({ tipo: 'error', texto: 'Preencha os campos obrigatórios.' });
      return;
    }

    if (formData.senha && formData.senha.length < 8) {
      setMensagem({ tipo: 'error', texto: 'A senha deve ter no mínimo 8 caracteres.' });
      return;
    }

    setSalvando(true);

    try {
      if (usuarioEditando) {
        await updateUsuario.mutateAsync({
          id: usuarioEditando.id,
          nome: formData.nome,
          email: formData.email,
          perfis: formData.perfis,
          perfil: formData.perfis[0],
          ...(formData.senha && { senha: formData.senha }),
        });
        setMensagem({ tipo: 'success', texto: 'Usuário atualizado.' });
      } else {
        await registerUsuario.mutateAsync({
          email: formData.email,
          nome: formData.nome,
          senha: formData.senha,
          perfis: formData.perfis,
          perfil: formData.perfis[0],
        });
        setMensagem({ tipo: 'success', texto: 'Usuário criado.' });
      }

      setModalAberto(false);
      setUsuarioEditando(null);
      setFormData({ email: '', nome: '', senha: '', perfis: ['operador'] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : (error as { error?: string })?.error || 'Erro';
      setMensagem({ tipo: 'error', texto: message });
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleAtivo = async (usuario: Usuario): Promise<void> => {
    try {
      await toggleUsuarioAtivo.mutateAsync(usuario.id);
      setMensagem({
        tipo: 'success',
        texto: usuario.ativo ? 'Usuário desativado.' : 'Usuário ativado.',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : (error as { error?: string })?.error || 'Erro';
      setMensagem({ tipo: 'error', texto: message });
    }
  };

  const erroComAcao = erro
    ? { ...erro, action: { label: 'Tentar novamente', onClick: invalidate } }
    : null;

  return (
    <PageState loading={carregando} loadingMessage="Carregando usuários..." error={erroComAcao}>
      <div className="space-y-6">
        <PageHeader
          title="Usuários"
          subtitle="Acessos e perfis do sistema."
          actions={
            <Button variant="primary" icon="plus" onClick={handleAbrirModalNovo}>
              Novo Usuário
            </Button>
          }
        />

        {mensagem ? (
          <ActionFeedback
            type={mensagem.tipo}
            title={
              mensagem.tipo === 'success' ? 'Atualização concluída' : 'Não foi possível concluir'
            }
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        ) : null}

        <Card padding="sm" className="bg-[var(--color-bg-secondary)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Total <strong className="text-[var(--color-text-primary)]">{resumo.total}</strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Ativos <strong className="text-[var(--color-text-primary)]">{resumo.ativos}</strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Administradores{' '}
              <strong className="text-[var(--color-text-primary)]">{resumo.admins}</strong>
            </span>
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="Acessos" className="px-5 pt-5" />

          <Table>
            <TableHead>
              <tr>
                <TableHeader>Usuário</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Perfil</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader align="right">Ações</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {usuarios.length === 0 ? (
                <TableEmptyState
                  colSpan={5}
                  title="Nenhum usuário encontrado"
                  description="Novos acessos aparecerão aqui."
                />
              ) : (
                usuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-gray-100)] text-sm font-semibold text-[var(--color-text-secondary)]">
                          {usuario.nome.trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--color-text-primary)]">
                            {usuario.nome}
                          </p>
                          <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                            Criado em {new Date(usuario.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--color-text-secondary)]">
                      {usuario.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {usuario.perfis.map((perfil) => (
                          <span
                            key={`${usuario.id}-${perfil}`}
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getPerfilBadgeClass(
                              perfil === 'administrador'
                                ? 'ADMIN'
                                : perfil === 'visualizador'
                                  ? 'VISUALIZADOR'
                                  : perfil.toUpperCase()
                            )}`}
                          >
                            {perfil === usuario.perfilAtivo
                              ? `${formatarPapel(perfil)} ativo`
                              : formatarPapel(perfil)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          usuario.ativo
                            ? 'bg-[var(--color-success-100)] text-[var(--color-success-700)]'
                            : 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="edit"
                          iconOnly
                          onClick={() => handleAbrirModalEditar(usuario)}
                          aria-label={`Editar Usuário ${usuario.nome}`}
                          title="Editar Usuário"
                        />
                        <Button
                          variant={usuario.ativo ? 'ghost' : 'success'}
                          size="sm"
                          icon={usuario.ativo ? 'x' : 'check'}
                          iconOnly
                          onClick={() => handleToggleAtivo(usuario)}
                          aria-label={
                            usuario.ativo
                              ? `Desativar usuário ${usuario.nome}`
                              : `Ativar usuário ${usuario.nome}`
                          }
                          title={usuario.ativo ? 'Desativar usuário' : 'Ativar usuário'}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Modal
          open={modalAberto}
          onClose={() => setModalAberto(false)}
          title={usuarioEditando ? 'Editar Usuário' : 'Novo Usuário'}
          subtitle={usuarioEditando ? '' : ''}
          footer={
            <div className="flex flex-col-reverse gap-3 p-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSalvar} loading={salvando}>
                {usuarioEditando ? 'Salvar Usuário' : 'Criar Usuário'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 p-5">
            <Input
              label="Nome *"
              value={formData.nome}
              onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
            />
            <Input
              label="Email *"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            />
            <Input
              label={
                usuarioEditando
                  ? 'Senha (deixe em branco para manter)'
                  : 'Senha * (mínimo 8 caracteres)'
              }
              type="password"
              value={formData.senha}
              onChange={(e) => setFormData((p) => ({ ...p, senha: e.target.value }))}
              required={!usuarioEditando}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Perfis *</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PERFIL_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-border-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  >
                    <input
                      type="checkbox"
                      checked={formData.perfis.includes(option.value)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          perfis: togglePerfilSelecionado(
                            prev.perfis,
                            option.value,
                            e.target.checked
                          ),
                        }))
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {!usuarioEditando ? (
              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                <div className="flex items-start gap-3">
                  <Icon
                    name="info"
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary-600)]"
                  />
                  <p>
                    O novo usuário poderá acessar as áreas permitidas pelos perfis
                    selecionados.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      </div>
    </PageState>
  );
}
