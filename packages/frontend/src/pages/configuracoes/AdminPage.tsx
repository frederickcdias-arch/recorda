import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Icon } from '../../components/ui/Icon';
import { ActionFeedback, PageState } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToastHelpers } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { queryKeys, useQueryClient } from '../../hooks/useQueries';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../utils/errors';

function ActionTile({
  title,
  description,
  icon,
  accentClass,
  buttonLabel,
  buttonVariant,
  onClick,
  loading,
}: {
  title: string;
  description: string;
  icon: string;
  accentClass: string;
  buttonLabel: string;
  buttonVariant: 'danger' | 'secondary';
  onClick: () => void;
  loading: boolean;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentClass}`}>
          <Icon name={icon} className="h-5 w-5" />
        </div>
        <h3 className="font-medium text-[var(--color-text-primary)]">{title}</h3>
      </div>
      <p className="mb-4 text-sm text-[var(--color-text-secondary)]">{description}</p>
      <Button
        variant={buttonVariant}
        size="sm"
        onClick={onClick}
        loading={loading}
        disabled={loading}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

export function AdminPage(): JSX.Element {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();
  const ambiente = import.meta.env.MODE === 'production' ? 'Produção' : 'Desenvolvimento';
  const versao = import.meta.env.VITE_APP_VERSION ?? 'dev';

  const [processando, setProcessando] = useState(false);
  const [resultados, setResultados] = useState<unknown>(null);

  if (usuario?.perfil !== 'administrador') {
    return (
      <PageState
        loading={false}
        error={{
          message: 'Acesso negado',
          details: 'Você não tem permissão para acessar esta página.',
        }}
      >
        <div className="py-8 text-center">
          <Icon name="lock" className="mx-auto mb-4 h-12 w-12 text-[var(--color-text-tertiary)]" />
          <h2 className="mb-2 text-lg font-medium text-[var(--color-text-primary)]">
            Acesso restrito
          </h2>
          <p className="text-[var(--color-text-secondary)]">
            Apenas administradores podem acessar esta página.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
            Perfil atual: {usuario?.perfil || 'não definido'}
          </p>
        </div>
      </PageState>
    );
  }

  const handleLimparDuplicatasProducao = async (): Promise<void> => {
    confirmDialog.confirm({
      title: 'Limpar duplicatas de produção',
      message: 'Deseja remover registros duplicados de produção? Esta ação não pode ser desfeita.',
      confirmLabel: 'Limpar',
      variant: 'danger',
      onConfirm: async () => {
        setProcessando(true);
        try {
          const result = await api.post<{ removidos: number }>('/admin/limpar-duplicatas-producao');
          setResultados(result);
          toast.success(`${result.removidos} duplicatas removidas.`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.producaoAll });
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao limpar duplicatas'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleLimparDuplicatasRecebimento = async (): Promise<void> => {
    confirmDialog.confirm({
      title: 'Limpar duplicatas de recebimento',
      message:
        'Deseja remover registros duplicados de recebimento? Esta ação não pode ser desfeita.',
      confirmLabel: 'Limpar',
      variant: 'danger',
      onConfirm: async () => {
        setProcessando(true);
        try {
          const result = await api.post<{ removidos: number }>(
            '/admin/limpar-duplicatas-recebimento'
          );
          setResultados(result);
          toast.success(`${result.removidos} duplicatas removidas.`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao limpar duplicatas'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleRecontarProducao = async (): Promise<void> => {
    confirmDialog.confirm({
      title: 'Recontar produção',
      message: 'Deseja recontar todos os registros de produção? Isso pode demorar vários minutos.',
      confirmLabel: 'Recontar',
      variant: 'warning',
      onConfirm: async () => {
        setProcessando(true);
        try {
          const result = await api.post<{ total: number }>('/admin/recontar-producao');
          setResultados(result);
          toast.success(`Recontagem concluída: ${result.total} registros processados.`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.producaoAll });
          await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao recontar produção'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleOtimizarBanco = async (): Promise<void> => {
    confirmDialog.confirm({
      title: 'Otimizar Banco de Dados',
      message:
        'Deseja otimizar o banco de dados? Isso irá atualizar estatísticas e reindexar tabelas.',
      confirmLabel: 'Otimizar',
      variant: 'warning',
      onConfirm: async () => {
        setProcessando(true);
        try {
          const result = await api.post('/admin/otimizar-banco');
          setResultados(result);
          toast.success('Banco de dados otimizado com sucesso.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao otimizar banco'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administração"
        subtitle="Ferramentas de manutenção e integridade de dados para uso controlado."
      />

      <ConfirmDialog
        state={confirmDialog.state}
        loading={confirmDialog.loading}
        onConfirm={() => void confirmDialog.handleConfirm()}
        onCancel={confirmDialog.close}
      />

      {resultados ? (
        <ActionFeedback
          type="success"
          title="Operação concluída"
          message={JSON.stringify(resultados, null, 2)}
          onDismiss={() => setResultados(null)}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card padding="sm">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)]">Ambiente</p>
          <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{ambiente}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)]">Versão</p>
          <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{versao}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
            Última atualização
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
            {new Date().toLocaleString('pt-BR')}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Limpeza de dados"
          description="Remove duplicidades em registros de produção e recebimento."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ActionTile
            title="Duplicatas de produção"
            description="Remove registros duplicados de produção. Não pode ser desfeito."
            icon="trash"
            accentClass="bg-[var(--color-error-50)] text-[var(--color-error-600)]"
            buttonLabel="Limpar duplicatas"
            buttonVariant="danger"
            onClick={() => void handleLimparDuplicatasProducao()}
            loading={processando}
          />
          <ActionTile
            title="Duplicatas de recebimento"
            description="Remove registros duplicados de recebimento. Não pode ser desfeito."
            icon="trash"
            accentClass="bg-[var(--color-warning-50)] text-[var(--color-warning-600)]"
            buttonLabel="Limpar duplicatas"
            buttonVariant="danger"
            onClick={() => void handleLimparDuplicatasRecebimento()}
            loading={processando}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Manutenção do sistema"
          description="Atualização de estatísticas e performance."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ActionTile
            title="Recontar produção"
            description="Recalcula totais e estatísticas gerais de produção."
            icon="refresh-cw"
            accentClass="bg-[var(--color-primary-50)] text-[var(--color-primary-600)]"
            buttonLabel="Recontar"
            buttonVariant="secondary"
            onClick={() => void handleRecontarProducao()}
            loading={processando}
          />
          <ActionTile
            title="Otimizar Banco"
            description="Atualiza estatísticas e executa otimizações estruturais no banco."
            icon="settings"
            accentClass="bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]"
            buttonLabel="Otimizar"
            buttonVariant="secondary"
            onClick={() => void handleOtimizarBanco()}
            loading={processando}
          />
        </div>
      </Card>
    </div>
  );
}
