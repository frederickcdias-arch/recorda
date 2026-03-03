import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageState } from '../../components/ui/PageState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToastHelpers } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { extractErrorMessage } from '../../utils/errors';
import { useQueryClient, queryKeys } from '../../hooks/useQueries';
import { api } from '../../services/api';

export function AdminPage(): JSX.Element {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();
  const ambiente = import.meta.env.MODE === 'production' ? 'ProduÃ§Ã£o' : 'Desenvolvimento';
  const versao = import.meta.env.VITE_APP_VERSION ?? 'dev';
  
  const [processando, setProcessando] = useState(false);
  const [resultados, setResultados] = useState<any>(null);
  
  // Verificar se o usuÃ¡rio Ã© administrador
  if (usuario?.perfil !== 'administrador') {
    return (
      <PageState loading={false} error={{ message: 'Acesso Negado', details: 'VocÃª nÃ£o tem permissÃ£o para acessar esta pÃ¡gina.' }}>
        <div className="text-center py-8">
          <Icon name="lock" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">Acesso Restrito</h2>
          <p className="text-gray-600">Apenas administradores podem acessar esta pÃ¡gina.</p>
          <p className="text-gray-400 text-sm mt-2">Perfil atual: {usuario?.perfil || 'nÃ£o definido'}</p>
        </div>
      </PageState>
    );
  }

  const handleLimparDuplicatasProducao = async (): Promise<void> => {
    confirmDialog.confirm({
      title: 'Limpar Duplicatas de ProduÃ§Ã£o',
      message: 'Deseja remover registros duplicados de produÃ§Ã£o? Esta aÃ§Ã£o nÃ£o pode ser desfeita.',
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
      title: 'Limpar Duplicatas de Recebimento',
      message: 'Deseja remover registros duplicados de recebimento? Esta aÃ§Ã£o nÃ£o pode ser desfeita.',
      confirmLabel: 'Limpar',
      variant: 'danger',
      onConfirm: async () => {
        setProcessando(true);
        try {
          const result = await api.post<{ removidos: number }>('/admin/limpar-duplicatas-recebimento');
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
      title: 'Recontar ProduÃ§Ã£o',
      message: 'Deseja recontar todos os registros de produÃ§Ã£o? Isso pode demorar vÃ¡rios minutos.',
      confirmLabel: 'Recontar',
      variant: 'warning',
      onConfirm: async () => {
        setProcessando(true);
        try {
          const result = await api.post<{ total: number }>('/admin/recontar-producao');
          setResultados(result);
          toast.success(`Recontagem concluÃ­da: ${result.total} registros processados.`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.producaoAll });
          await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao recontar produÃ§Ã£o'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleOtimizarBanco = async (): Promise<void> => {
    confirmDialog.confirm({
      title: 'Otimizar Banco de Dados',
      message: 'Deseja otimizar o banco de dados? Isso irÃ¡ atualizar estatÃ­sticas e reindexar tabelas.',
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AdministraÃ§Ã£o do Sistema</h1>
        <p className="text-gray-500 mt-1">
          Ferramentas de manutenÃ§Ã£o e gerenciamento de dados
        </p>
      </div>

      <ConfirmDialog
        state={confirmDialog.state}
        loading={confirmDialog.loading}
        onConfirm={() => void confirmDialog.handleConfirm()}
        onCancel={confirmDialog.close}
      />

      {/* Resultados */}
      {resultados && (
        <Card>
          <div className="p-4 bg-green-50 border border-green-100 rounded-lg">
            <h3 className="text-sm font-medium text-green-800 mb-2">OperaÃ§Ã£o ConcluÃ­da</h3>
            <pre className="text-xs text-green-700 whitespace-pre-wrap">
              {JSON.stringify(resultados, null, 2)}
            </pre>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setResultados(null)}
              className="mt-2"
            >
              Fechar
            </Button>
          </div>
        </Card>
      )}

      {/* Limpeza de Duplicatas */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Limpeza de Dados</h2>
          <p className="text-gray-600 mb-6">
            Remova registros duplicados para manter a integridade dos dados.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-red-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Icon name="trash" className="w-5 h-5 text-red-600 mr-2" />
                <h3 className="font-medium text-gray-900">ProduÃ§Ã£o</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Remove registros duplicados de produÃ§Ã£o baseado em colaborador, data, etapa e quantidade.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleLimparDuplicatasProducao()}
                loading={processando}
                disabled={processando}
              >
                Limpar Duplicatas
              </Button>
            </div>
            
            <div className="p-4 border border-orange-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Icon name="trash" className="w-5 h-5 text-orange-600 mr-2" />
                <h3 className="font-medium text-gray-900">Recebimento</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Remove registros duplicados de recebimento baseado em processo e repositÃ³rio.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleLimparDuplicatasRecebimento()}
                loading={processando}
                disabled={processando}
              >
                Limpar Duplicatas
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ManutenÃ§Ã£o */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ManutenÃ§Ã£o do Sistema</h2>
          <p className="text-gray-600 mb-6">
            OperaÃ§Ãµes de manutenÃ§Ã£o e otimizaÃ§Ã£o do sistema.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-blue-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Icon name="refresh-cw" className="w-5 h-5 text-blue-600 mr-2" />
                <h3 className="font-medium text-gray-900">Recontar ProduÃ§Ã£o</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Recalcula todas as estatÃ­sticas e totais de produÃ§Ã£o.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleRecontarProducao()}
                loading={processando}
                disabled={processando}
              >
                Recontar
              </Button>
            </div>
            
            <div className="p-4 border border-purple-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Icon name="settings" className="w-5 h-5 text-purple-600 mr-2" />
                <h3 className="font-medium text-gray-900">Otimizar Banco</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Atualiza estatÃ­sticas e otimiza performance do banco.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleOtimizarBanco()}
                loading={processando}
                disabled={processando}
              >
                Otimizar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* InformaÃ§Ãµes do Sistema */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">InformaÃ§Ãµes do Sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">VersÃ£o:</span>
              <span className="ml-2 font-medium">{versao}</span>
            </div>
            <div>
              <span className="text-gray-500">Ambiente:</span>
              <span className="ml-2 font-medium">{ambiente}</span>
            </div>
            <div>
              <span className="text-gray-500">Ãšltima atualizaÃ§Ã£o:</span>
              <span className="ml-2 font-medium">{new Date().toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
