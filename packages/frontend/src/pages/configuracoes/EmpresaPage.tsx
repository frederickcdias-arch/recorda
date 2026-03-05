import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Icon } from '../../components/ui/Icon';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useEmpresa, useSaveEmpresa, useUploadLogo, useRemoveLogo, useQueryClient, queryKeys } from '../../hooks/useQueries';
import { buildApiUrl } from '../../services/api';

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
  logoLarguraRelatorio: number;
  logoAlinhamentoRelatorio: 'ESQUERDA' | 'CENTRO' | 'DIREITA';
  logoDeslocamentoYRelatorio: number;
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
    logoLarguraRelatorio: 120,
    logoAlinhamentoRelatorio: 'CENTRO',
    logoDeslocamentoYRelatorio: 0,
  });
  const [salvando, setSalvando] = useState(false);
  const confirmDialog = useConfirmDialog();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoLoadError, setLogoLoadError] = useState(false);
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
        logoLarguraRelatorio: Math.min(Math.max(Number(data.logoLarguraRelatorio ?? 120), 60), 260),
        logoAlinhamentoRelatorio: (data.logoAlinhamentoRelatorio as 'ESQUERDA' | 'CENTRO' | 'DIREITA') ?? 'CENTRO',
        logoDeslocamentoYRelatorio: Math.min(Math.max(Number(data.logoDeslocamentoYRelatorio ?? 0), -20), 40),
      });
    }
  }, [empresaQuery.data]);

  useEffect(() => {
    setLogoLoadError(false);
  }, [config.logoUrl]);

  const handleChange = (field: keyof EmpresaConfig, value: string | boolean | number): void => {
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
      : buildApiUrl(config.logoUrl)
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
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="w-32 h-32 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden flex-shrink-0">
              {logoSrc && !logoLoadError ? (
                <img
                  src={logoSrc}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain p-2"
                  onError={() => setLogoLoadError(true)}
                />
              ) : (
                <div className="text-center p-3">
                  <Icon name="image" className="w-8 h-8 text-gray-300 mx-auto mb-1" />
                  <span className="text-gray-400 text-xs">
                    {config.logoUrl ? 'Erro ao carregar logo' : 'Sem logo'}
                  </span>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="logo-largura" className="block text-sm font-medium text-gray-700 mb-1">
                Largura da logo (px)
              </label>
              <input
                id="logo-largura"
                type="range"
                min={60}
                max={260}
                step={5}
                value={config.logoLarguraRelatorio}
                onChange={(e) => handleChange('logoLarguraRelatorio', Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">{config.logoLarguraRelatorio}px</p>
            </div>

            <div>
              <label htmlFor="logo-alinhamento" className="block text-sm font-medium text-gray-700 mb-1">
                Alinhamento da logo
              </label>
              <select
                id="logo-alinhamento"
                value={config.logoAlinhamentoRelatorio}
                onChange={(e) => handleChange('logoAlinhamentoRelatorio', e.target.value as 'ESQUERDA' | 'CENTRO' | 'DIREITA')}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="ESQUERDA">Esquerda</option>
                <option value="CENTRO">Centro</option>
                <option value="DIREITA">Direita</option>
              </select>
            </div>

            <div>
              <label htmlFor="logo-offset-y" className="block text-sm font-medium text-gray-700 mb-1">
                Deslocamento vertical (px)
              </label>
              <input
                id="logo-offset-y"
                type="range"
                min={-20}
                max={40}
                step={1}
                value={config.logoDeslocamentoYRelatorio}
                onChange={(e) => handleChange('logoDeslocamentoYRelatorio', Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {config.logoDeslocamentoYRelatorio > 0 ? `+${config.logoDeslocamentoYRelatorio}` : config.logoDeslocamentoYRelatorio}px
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">PrÃ©-visualizaÃ§Ã£o no relatÃ³rio</p>
            <div className="mx-auto w-full max-w-[720px] rounded-md bg-white border border-gray-200 px-8 py-6">
              <div className="relative h-24">
                {config.exibirLogoRelatorio && logoSrc && !logoLoadError ? (
                  <img
                    src={logoSrc}
                    alt="PrÃ©-visualizaÃ§Ã£o da logo"
                    className="absolute max-h-20 object-contain"
                    style={{
                      width: `${config.logoLarguraRelatorio}px`,
                      top: `${Math.max(config.logoDeslocamentoYRelatorio, -12)}px`,
                      left: config.logoAlinhamentoRelatorio === 'ESQUERDA'
                        ? '0'
                        : config.logoAlinhamentoRelatorio === 'DIREITA'
                          ? `calc(100% - ${config.logoLarguraRelatorio}px)`
                          : `calc(50% - ${config.logoLarguraRelatorio / 2}px)`,
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                    Sem logo no cabeÃ§alho
                  </div>
                )}
              </div>
              <div className="h-[3px] bg-blue-800 mt-1" />
              <p className="mt-3 text-center text-[11px] text-gray-500">CabeÃ§alho simulado em A4</p>
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
