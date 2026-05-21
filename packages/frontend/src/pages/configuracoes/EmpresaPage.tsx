import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Icon } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { ActionFeedback, PageState } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import {
  queryKeys,
  useEmpresa,
  useQueryClient,
  useRemoveLogo,
  useSaveEmpresa,
  useUploadLogo,
} from '../../hooks/useQueries';
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

function ToggleCard({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4 transition-colors hover:bg-[var(--color-gray-50)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-primary)] text-[var(--color-primary-600)] focus:ring-[var(--color-primary-500)]"
      />
      <div>
        <span className="font-medium text-[var(--color-text-primary)]">{title}</span>
        <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </label>
  );
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
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const saveEmpresa = useSaveEmpresa();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();

  const empresaQuery = useEmpresa();
  const carregando = empresaQuery.isLoading;
  const erro = empresaQuery.error
    ? {
        message: 'Erro ao carregar configurações',
        details:
          empresaQuery.error instanceof Error
            ? empresaQuery.error.message
            : 'Verifique sua conexão',
      }
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
        logoAlinhamentoRelatorio:
          (data.logoAlinhamentoRelatorio as 'ESQUERDA' | 'CENTRO' | 'DIREITA') ?? 'CENTRO',
        logoDeslocamentoYRelatorio: Math.min(
          Math.max(Number(data.logoDeslocamentoYRelatorio ?? 0), -20),
          40
        ),
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
      setMensagem({
        tipo: 'success',
        texto:
          'Configurações salvas com sucesso. As alterações serão refletidas nos próximos relatórios gerados.',
      });
    } catch {
      setMensagem({
        tipo: 'error',
        texto: 'Não foi possível salvar as configurações. Verifique sua conexão e tente novamente.',
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setMensagem({
        tipo: 'error',
        texto: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O tamanho máximo é 5 MB.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingLogo(true);
    setMensagem(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const data = await uploadLogo.mutateAsync(formData);
      setConfig((prev) => ({ ...prev, logoUrl: data.logoUrl }));
      setMensagem({ tipo: 'success', texto: 'Logo enviada com sucesso.' });
    } catch (error) {
      setMensagem({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'Erro ao fazer upload da logo.',
      });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoverLogo = (): void => {
    confirmDialog.confirm({
      title: 'Remover logo',
      message: 'Deseja remover a logo da empresa?',
      confirmLabel: 'Remover',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await removeLogo.mutateAsync();
          setConfig((prev) => ({ ...prev, logoUrl: '' }));
          setMensagem({ tipo: 'success', texto: 'Logo removida com sucesso.' });
        } catch {
          setMensagem({ tipo: 'error', texto: 'Erro ao remover a logo.' });
        }
      },
    });
  };

  const logoSrc = config.logoUrl
    ? config.logoUrl.startsWith('http')
      ? config.logoUrl
      : buildApiUrl(config.logoUrl)
    : '';

  const erroComAcao = erro
    ? {
        ...erro,
        action: {
          label: 'Tentar novamente',
          onClick: (): void => void queryClient.invalidateQueries({ queryKey: queryKeys.empresa }),
        },
      }
    : null;

  return (
    <PageState
      loading={carregando}
      loadingMessage="Carregando configurações..."
      error={erroComAcao}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Empresa"
          subtitle="Configure identidade institucional e dados exibidos em relatórios e documentos."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.empresa })}
              >
                Recarregar
              </Button>
              <Button
                variant="primary"
                icon="check-square"
                loading={salvando}
                onClick={handleSalvar}
              >
                Salvar configurações
              </Button>
            </div>
          }
        />

        {mensagem ? (
          <ActionFeedback
            type={mensagem.tipo}
            title={
              mensagem.tipo === 'success' ? 'Configuração atualizada' : 'Não foi possível concluir'
            }
            message={mensagem.texto}
            onDismiss={() => setMensagem(null)}
          />
        ) : null}

        <Card>
          <CardHeader
            title="Dados da empresa"
            description="Informações que poderão aparecer em relatórios, cabeçalhos e rodapés."
          />

          <div className="space-y-4">
            <Input
              label="Nome da empresa"
              value={config.nome}
              onChange={(e) => handleChange('nome', e.target.value)}
              placeholder="Nome completo da empresa"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <Card>
          <CardHeader
            title="Logo da empresa"
            description="Imagem usada no cabeçalho dos relatórios e documentos gerados."
          />

          <div className="space-y-5">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="flex h-40 w-full max-w-[13rem] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
                {logoSrc && !logoLoadError ? (
                  <img
                    src={logoSrc}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain p-4"
                    onError={() => setLogoLoadError(true)}
                  />
                ) : (
                  <div className="p-4 text-center">
                    <Icon
                      name="image"
                      className="mx-auto mb-2 h-8 w-8 text-[var(--color-text-tertiary)]"
                    />
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {config.logoUrl ? 'Erro ao carregar logo' : 'Sem logo cadastrada'}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4 text-sm text-[var(--color-text-secondary)]">
                  Envie a logo da empresa em PNG, JPG, SVG ou WebP. Tamanho máximo: 5 MB.
                </div>

                <div className="flex flex-wrap items-center gap-3">
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
                    {config.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                  </Button>
                  {config.logoUrl ? (
                    <Button variant="secondary" icon="trash" onClick={handleRemoverLogo}>
                      Remover
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4">
                    <label
                      htmlFor="logo-largura"
                      className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
                    >
                      Largura da logo
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
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      {config.logoLarguraRelatorio}px
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4">
                    <Select
                      id="logo-alinhamento"
                      label="Alinhamento da logo"
                      value={config.logoAlinhamentoRelatorio}
                      onChange={(e) =>
                        handleChange(
                          'logoAlinhamentoRelatorio',
                          e.target.value as 'ESQUERDA' | 'CENTRO' | 'DIREITA'
                        )
                      }
                    >
                      <option value="ESQUERDA">Esquerda</option>
                      <option value="CENTRO">Centro</option>
                      <option value="DIREITA">Direita</option>
                    </Select>
                  </div>

                  <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4">
                    <label
                      htmlFor="logo-offset-y"
                      className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
                    >
                      Deslocamento vertical
                    </label>
                    <input
                      id="logo-offset-y"
                      type="range"
                      min={-20}
                      max={40}
                      step={1}
                      value={config.logoDeslocamentoYRelatorio}
                      onChange={(e) =>
                        handleChange('logoDeslocamentoYRelatorio', Number(e.target.value))
                      }
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      {config.logoDeslocamentoYRelatorio > 0
                        ? `+${config.logoDeslocamentoYRelatorio}`
                        : config.logoDeslocamentoYRelatorio}
                      px
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
              <p className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                Pré-visualização no relatório
              </p>
              <div className="mx-auto w-full max-w-[720px] rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-8 py-6 shadow-xs">
                <div className="relative h-24">
                  {config.exibirLogoRelatorio && logoSrc && !logoLoadError ? (
                    <img
                      src={logoSrc}
                      alt="Pré-visualização da logo"
                      className="absolute max-h-20 object-contain"
                      style={{
                        width: `${config.logoLarguraRelatorio}px`,
                        top: `${Math.max(config.logoDeslocamentoYRelatorio, -12)}px`,
                        left:
                          config.logoAlinhamentoRelatorio === 'ESQUERDA'
                            ? '0'
                            : config.logoAlinhamentoRelatorio === 'DIREITA'
                              ? `calc(100% - ${config.logoLarguraRelatorio}px)`
                              : `calc(50% - ${config.logoLarguraRelatorio / 2}px)`,
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                      Sem logo no cabeçalho
                    </div>
                  )}
                </div>
                <div className="mt-1 h-[3px] bg-[var(--color-primary-700)]" />
                <p className="mt-3 text-center text-[11px] text-[var(--color-text-tertiary)]">
                  Cabeçalho simulado em A4
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Exibição nos relatórios"
            description="Defina quais informações institucionais entram em cada documento."
          />

          <div className="space-y-3">
            <ToggleCard
              checked={config.exibirLogoRelatorio}
              title="Exibir logo no cabeçalho"
              description="A logo aparecerá no topo de cada página do relatório."
              onChange={(value) => handleChange('exibirLogoRelatorio', value)}
            />
            <ToggleCard
              checked={config.exibirEnderecoRelatorio}
              title="Exibir endereço no rodapé"
              description="O endereço aparecerá no rodapé de cada página."
              onChange={(value) => handleChange('exibirEnderecoRelatorio', value)}
            />
            <ToggleCard
              checked={config.exibirContatoRelatorio}
              title="Exibir contato no rodapé"
              description="Telefone e e-mail aparecerão junto ao endereço no rodapé."
              onChange={(value) => handleChange('exibirContatoRelatorio', value)}
            />
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
