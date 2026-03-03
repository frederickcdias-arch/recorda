import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Icon } from '../../components/ui/Icon';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useEmpresa, useSaveEmpresa, useUploadLogo, useRemoveLogo, useQueryClient, queryKeys } from '../../hooks/useQueries';

interface EmpresaConfig {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  logoUrl: string;
  exibirLogoRelatorio: boolean;
  exibirEnderecoRelatorio: boolean;
  exibirContatoRelatorio: boolean;
}

export function EmpresaPage(): JSX.Element {
  const [config, setConfig] = useState<EmpresaConfig>({
    nome: '',
    cnpj: '',
    endereco: '',
    telefone: '',
    email: '',
    logoUrl: '',
    exibirLogoRelatorio: true,
    exibirEnderecoRelatorio: true,
    exibirContatoRelatorio: false,
  });
  const [salvando, setSalvando] = useState(false);
  const confirmDialog = useConfirmDialog();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const saveEmpresa = useSaveEmpresa();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();

  const empresaQuery = useEmpresa();
  const carregando = empresaQuery.isLoading;
  const erro = empresaQuery.error
    ? { message: 'Erro ao Carregar Configurações', details: empresaQuery.error instanceof Error ? empresaQuery.error.message : 'Verifique sua conexão' }
    : null;

  useEffect(() => {
    if (empresaQuery.data) {
      const data = empresaQuery.data as Partial<EmpresaConfig>;
      setConfig({
        nome: data.nome ?? '',
        cnpj: data.cnpj ?? '',
        endereco: data.endereco ?? '',
        telefone: data.telefone ?? '',
        email: data.email ?? '',
        logoUrl: data.logoUrl ?? '',
        exibirLogoRelatorio: data.exibirLogoRelatorio ?? true,
        exibirEnderecoRelatorio: data.exibirEnderecoRelatorio ?? true,
        exibirContatoRelatorio: data.exibirContatoRelatorio ?? false,
      });
    }
  }, [empresaQuery.data]);

  const handleChange = (field: keyof EmpresaConfig, value: string | boolean): void => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSalvar = async (): Promise<void> => {
    setSalvando(true);
    setMensagem(null);

    try {
      await saveEmpresa.mutateAsync(config);
      setMensagem({ tipo: 'success', texto: 'Configurações salvas com sucesso! As alterações serão refletidas nos próximos relatórios gerados.' });
    } catch {
      setMensagem({ tipo: 'error', texto: 'Não foi possível salvar as configurações. Verifique sua conexão e tente novamente.' });
    } finally {
      setSalvando(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setMensagem(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const data = await uploadLogo.mutateAsync(formData);
      setConfig((prev) => ({ ...prev, logoUrl: data.logoUrl }));
      setMensagem({ tipo: 'success', texto: 'Logo enviada com sucesso!' });
    } catch (error) {
      setMensagem({ tipo: 'error', texto: error instanceof Error ? error.message : 'Erro ao fazer upload da logo' });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoverLogo = (): void => {
    confirmDialog.confirm({
      title: 'Remover Logo',
      message: 'Deseja remover a logo da empresa?',
      confirmLabel: 'Remover',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await removeLogo.mutateAsync();
          setConfig((prev) => ({ ...prev, logoUrl: '' }));
          setMensagem({ tipo: 'success', texto: 'Logo removida com sucesso!' });
        } catch {
          setMensagem({ tipo: 'error', texto: 'Erro ao remover a logo' });
        }
      },
    });
  };

  const logoSrc = config.logoUrl
    ? config.logoUrl.startsWith('http')
      ? config.logoUrl
      : `/api${config.logoUrl}?t=${Date.now()}`
    : '';

  const erroComAcao = erro ? { ...erro, action: { label: 'Tentar novamente', onClick: () => void queryClient.invalidateQueries({ queryKey: queryKeys.empresa }) } } : null;

  return (
    <PageState loading={carregando} loadingMessage="Carregando Configurações..." error={erroComAcao}>
      <div className="space-y-6 max-w-3xl">
        {mensagem && (
          <ActionFeedback
            type={mensagem.tipo}
            title={mensagem.tipo === 'success' ? 'Configurações Salvas' : 'Erro ao Salvar'}
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        )}

      {/* Dados da Empresa */}
      <Card>
        <CardHeader
          title="Dados da Empresa"
          description="Informações que serão exibidas nos relatórios e documentos"
        />

        <div className="space-y-4">
          <Input
            label="Nome da Empresa"
            value={config.nome}
            onChange={(e) => handleChange('nome', e.target.value)}
            placeholder="Nome completo da empresa"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="CNPJ"
              value={config.cnpj}
              onChange={(e) => handleChange('cnpj', e.target.value)}
              placeholder="00.000.000/0001-00"
            />
            <Input
              label="Telefone"
              value={config.telefone}
              onChange={(e) => handleChange('telefone', e.target.value)}
              placeholder="(00) 0000-0000"
            />
          </div>

          <Input
            label="E-mail"
            type="email"
            value={config.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="contato@empresa.com.br"
          />

          <Input
            label="Endereço"
            value={config.endereco}
            onChange={(e) => handleChange('endereco', e.target.value)}
            placeholder="Rua, número - Bairro - Cidade/UF"
          />
        </div>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader
          title="Logo da Empresa"
          description="Imagem que será exibida no cabeçalho dos relatórios"
        />

        <div className="space-y-4">
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden flex-shrink-0">
              {logoSrc ? (
                <img src={logoSrc} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <Icon name="image" className="w-8 h-8 text-gray-300 mx-auto mb-1" />
                  <span className="text-gray-400 text-xs">Sem logo</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-gray-600">
                Envie a logo da empresa em formato PNG, JPG, SVG ou WebP. Tamanho máximo: 5MB.
              </p>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  onChange={handleUploadLogo}
                  className="hidden"
                  id="logo-upload"
                />
                <Button
                  variant="primary"
                  icon="upload"
                  loading={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {config.logoUrl ? 'Trocar Logo' : 'Enviar Logo'}
                </Button>
                {config.logoUrl && (
                  <Button
                    variant="secondary"
                    icon="trash"
                    onClick={handleRemoverLogo}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Opções de Exibição */}
      <Card>
        <CardHeader
          title="Exibição nos Relatórios"
          description="Configure quais informações aparecem nos relatórios gerados"
        />

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={config.exibirLogoRelatorio}
              onChange={(e) => handleChange('exibirLogoRelatorio', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Exibir Logo no Cabeçalho</span>
              <p className="text-sm text-gray-500">A logo aparecerá no topo de cada página do Relatório</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={config.exibirEnderecoRelatorio}
              onChange={(e) => handleChange('exibirEnderecoRelatorio', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Exibir Endereço no Rodapé</span>
              <p className="text-sm text-gray-500">O endereço aparecerá no Rodapé de cada página</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={config.exibirContatoRelatorio}
              onChange={(e) => handleChange('exibirContatoRelatorio', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Exibir Contato no Rodapé</span>
              <p className="text-sm text-gray-500">Telefone e e-mail aparecerão junto ao endereço no Rodapé</p>
            </div>
          </label>
        </div>
      </Card>

        {/* Ações */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.empresa })}>Cancelar</Button>
          <Button
            variant="primary"
            icon="check-square"
            loading={salvando}
            onClick={handleSalvar}
          >
            Salvar Configurações
          </Button>
        </div>

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
