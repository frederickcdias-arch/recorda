import { useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useRecebimentoAvulsos } from '../../hooks/useRecebimentoAvulsos';
import { Pagination } from '../../components/ui/Pagination';
import { useRepositoriosRecebimento, useOcrPreviewAvulso } from '../../hooks/useQueries';
import { RecebimentoLoteModal } from './RecebimentoLoteModal';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Falha ao ler arquivo'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

interface RecebimentoAvulsosPanelProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function RecebimentoAvulsosPanel({ onSuccess, onError }: RecebimentoAvulsosPanelProps): JSX.Element {
  const {
    avulsos, carregando, processando, pagina, setPagina, totalPaginas, selecionados,
    form, setForm, formAberto, setFormAberto,
    vincularModalOpen, setVincularModalOpen,
    setoresOptions, classificacoesOptions,
    novoSetorInput, setNovoSetorInput, novaClassifInput, setNovaClassifInput,
    EMPTY_FORM,
    apensoProcessoId, setApensoProcessoId,
    apensoFormAberto, setApensoFormAberto,
    apensoForm, setApensoForm,
    invalidateAvulsos,
    busca, setBusca,
    handleCriarAvulso, handleExcluirAvulso,
    handleAdicionarApenso, handleExcluirApenso,
    handleVincular,
    handleCriarSetor, handleCriarClassificacao,
    toggleSelecionado, toggleTodos,
    confirmDialog,
  } = useRecebimentoAvulsos();

  const [repoSelecionado, setRepoSelecionado] = useState('');
  const [repoBusca, setRepoBusca] = useState('');
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [ocrProcessando, setOcrProcessando] = useState(false);
  const ocrPreviewMut = useOcrPreviewAvulso();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleOcrFile = async (file: File | null): Promise<void> => {
    if (!file) return;
    try {
      setOcrProcessando(true);
      const base64 = await fileToBase64(file);
      const preview = await ocrPreviewMut.mutateAsync(base64);
      setForm((p) => ({
        ...p,
        protocolo: preview.protocolo || p.protocolo,
        interessado: preview.interessado || p.interessado,
      }));
      onSuccess(`OCR: confiança ${(preview.confianca * 100).toFixed(0)}%. Revise os campos.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao Processar OCR');
    } finally {
      setOcrProcessando(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleBuscar = (): void => {
    setPagina(1);
  };

  const reposQuery = useRepositoriosRecebimento();
  const reposDisponiveis = reposQuery.data ?? [];

  const handleAbrirVincular = (): void => {
    if (selecionados.size === 0) {
      onError('Selecione pelo menos um processo para vincular.');
      return;
    }
    setRepoSelecionado('');
    setRepoBusca('');
    setVincularModalOpen(true);
  };

  const handleConfirmarVincular = async (): Promise<void> => {
    if (!repoSelecionado) {
      onError('Selecione um repositório.');
      return;
    }
    await handleVincular(repoSelecionado);
    onSuccess(`${selecionados.size} processo(s) vinculado(s).`);
  };

  const reposFiltrados = reposDisponiveis.filter((r) => {
    if (!repoBusca.trim()) return true;
    const termo = repoBusca.toLowerCase();
    return (
      r.id_repositorio_ged.toLowerCase().includes(termo) ||
      r.orgao.toLowerCase().includes(termo) ||
      r.projeto.toLowerCase().includes(termo)
    );
  });

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Buscar avulsos"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Protocolo ou interessado"
              onKeyDown={(e) => { if (e.key === 'Enter') handleBuscar(); }}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={handleBuscar} loading={carregando}>Buscar</Button>
          <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setFormAberto(true); }}>
            + Novo Avulso
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLoteModalOpen(true)}>
            Adicionar em Lote
          </Button>
          {selecionados.size > 0 && (
            <Button size="sm" variant="outline" onClick={() => void handleAbrirVincular()}>
              Vincular ({selecionados.size})
            </Button>
          )}
        </div>
      </Card>

      {/* Formulário de novo avulso */}
      {formAberto && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Cadastrar Processo Avulso</h3>

          {/* OCR photo upload */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs font-medium text-blue-800 mb-2">Preencher via Foto (OCR)</p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => void handleOcrFile(e.target.files?.[0] ?? null)} className="hidden" />
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => void handleOcrFile(e.target.files?.[0] ?? null)} className="hidden" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => cameraRef.current?.click()} loading={ocrProcessando} disabled={ocrProcessando}>
                Capturar Foto
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={ocrProcessando} disabled={ocrProcessando}>
                Selecionar Imagem
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              label="Protocolo *"
              value={form.protocolo}
              onChange={(e) => setForm((p) => ({ ...p, protocolo: e.target.value }))}
              placeholder="Ex: 502824/2021"
            />
            <Input
              label="Interessado *"
              value={form.interessado}
              onChange={(e) => setForm((p) => ({ ...p, interessado: e.target.value }))}
              placeholder="Ex: JBS S/A"
            />

            {/* Setor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
              <select
                className="w-full h-9 px-3 border rounded-lg text-sm"
                value={form.setorId}
                onChange={(e) => setForm((p) => ({ ...p, setorId: e.target.value }))}
              >
                <option value="">— Selecione —</option>
                {setoresOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
              <div className="flex gap-1 mt-1">
                <input
                  type="text"
                  className="flex-1 h-8 px-2 border rounded text-xs"
                  placeholder="Novo setor..."
                  value={novoSetorInput}
                  onChange={(e) => setNovoSetorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCriarSetor(); } }}
                />
                <button
                  type="button"
                  className="h-8 px-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => void handleCriarSetor()}
                  disabled={!novoSetorInput.trim()}
                >+</button>
              </div>
            </div>

            {/* Classificação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classificação</label>
              <select
                className="w-full h-9 px-3 border rounded-lg text-sm"
                value={form.classificacaoId}
                onChange={(e) => setForm((p) => ({ ...p, classificacaoId: e.target.value }))}
              >
                <option value="">— Selecione —</option>
                {classificacoesOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <div className="flex gap-1 mt-1">
                <input
                  type="text"
                  className="flex-1 h-8 px-2 border rounded text-xs"
                  placeholder="Nova classificação..."
                  value={novaClassifInput}
                  onChange={(e) => setNovaClassifInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCriarClassificacao(); } }}
                />
                <button
                  type="button"
                  className="h-8 px-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => void handleCriarClassificacao()}
                  disabled={!novaClassifInput.trim()}
                >+</button>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Volume"
                  type="number"
                  min={1}
                  value={String(form.volumeAtual)}
                  onChange={(e) => setForm((p) => ({ ...p, volumeAtual: Math.max(Number(e.target.value || 1), 1) }))}
                />
              </div>
              <span className="self-end pb-2 text-gray-500 text-sm">de</span>
              <div className="flex-1">
                <Input
                  label="Total"
                  type="number"
                  min={0}
                  value={String(form.volumeTotal)}
                  onChange={(e) => setForm((p) => ({ ...p, volumeTotal: Math.max(Number(e.target.value || 0), 0) }))}
                />
              </div>
            </div>

            <Input
              label="Nº Caixas"
              type="number"
              min={1}
              value={String(form.numeroCaixas)}
              onChange={(e) => setForm((p) => ({ ...p, numeroCaixas: Math.max(Number(e.target.value || 1), 1) }))}
            />
          </div>

          <div className="mt-3">
            <Input
              label="Observação"
              value={form.observacao}
              onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
              placeholder="Observação (opcional)"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => void handleCriarAvulso()} loading={processando}>Salvar Avulso</Button>
            <Button variant="secondary" onClick={() => setFormAberto(false)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* Lista de avulsos */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Processos Avulsos ({avulsos.length})
          </h3>
          {avulsos.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={selecionados.size === avulsos.length && avulsos.length > 0}
                onChange={toggleTodos}
                className="rounded"
              />
              {selecionados.size} selecionado(s)
            </label>
          )}
        </div>

        {avulsos.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Nenhum Processo Avulso cadastrado.
          </p>
        ) : (
          <div className="space-y-3">
            {avulsos.map((proc) => (
              <div key={proc.id} className={`border rounded-lg overflow-hidden ${selecionados.has(proc.id) ? 'ring-2 ring-blue-400' : ''}`}>
                {/* Processo principal */}
                <div className="bg-blue-50 px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selecionados.has(proc.id)}
                        onChange={() => toggleSelecionado(proc.id)}
                        className="rounded mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-blue-900">{proc.protocolo}</span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            Vol. {proc.volume_atual}{proc.volume_total > 0 ? ` de ${proc.volume_total}` : ' (único)'}
                          </span>
                          {proc.setor_nome ? <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{proc.setor_nome}</span> : null}
                          {proc.classificacao_nome ? <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{proc.classificacao_nome}</span> : null}
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{proc.interessado}</p>
                        {proc.observacao ? <p className="text-xs text-gray-500 mt-0.5">{proc.observacao}</p> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 ml-2 shrink-0">
                      <Button size="xs" variant="outline" onClick={() => {
                        setApensoProcessoId(proc.id);
                        setApensoFormAberto(true);
                        setApensoForm({ protocolo: '', interessado: '', volumeAtual: 1, volumeTotal: 0 });
                      }}>
                        + Apenso
                      </Button>
                      <Button size="xs" variant="danger" onClick={() => void handleExcluirAvulso(proc.id)} disabled={processando}>
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Inline apenso form */}
                {apensoFormAberto && apensoProcessoId === proc.id ? (
                  <div className="border-t bg-blue-50 px-4 py-3">
                    <h5 className="text-xs font-semibold text-blue-800 mb-2">Novo Apenso para {proc.protocolo}</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        label="Protocolo *"
                        value={apensoForm.protocolo}
                        onChange={(e) => setApensoForm((p) => ({ ...p, protocolo: e.target.value }))}
                        placeholder="Ex: 502825/2021"
                      />
                      <Input
                        label="Interessado"
                        value={apensoForm.interessado}
                        onChange={(e) => setApensoForm((p) => ({ ...p, interessado: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            label="Volume"
                            type="number"
                            min={1}
                            value={String(apensoForm.volumeAtual)}
                            onChange={(e) => setApensoForm((p) => ({ ...p, volumeAtual: Math.max(Number(e.target.value || 1), 1) }))}
                          />
                        </div>
                        <span className="self-end pb-2 text-gray-500 text-xs">de</span>
                        <div className="flex-1">
                          <Input
                            label="Total"
                            type="number"
                            min={0}
                            value={String(apensoForm.volumeTotal)}
                            onChange={(e) => setApensoForm((p) => ({ ...p, volumeTotal: Math.max(Number(e.target.value || 0), 0) }))}
                          />
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <Button size="sm" onClick={() => void handleAdicionarApenso()} loading={processando}>Salvar Apenso</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setApensoFormAberto(false); setApensoProcessoId(''); }}>Cancelar</Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Apensos list */}
                {proc.apensos.length > 0 ? (
                  <div className="border-t">
                    {proc.apensos.map((ap) => (
                      <div key={ap.id} className="px-4 py-2 bg-gray-50 border-b last:border-b-0 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-gray-400">↳ Apenso</span>
                          <span className="text-sm font-medium text-gray-800">{ap.protocolo}</span>
                          {ap.interessado ? <span className="text-xs text-gray-500">— {ap.interessado}</span> : null}
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            Vol. {ap.volume_atual}{ap.volume_total > 0 ? ` de ${ap.volume_total}` : ''}
                          </span>
                        </div>
                        <Button size="xs" variant="danger" onClick={() => void handleExcluirApenso(ap.id)} disabled={processando}>
                          Excluir
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <Pagination pagina={pagina} totalPaginas={totalPaginas} onChange={(p) => setPagina(p)} disabled={carregando} />
      </Card>

      {/* Modal vincular a repositório */}
      {vincularModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col animate-scale-in">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Vincular {selecionados.size} processo(s) a repositório
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Selecione o repositório de destino na etapa de Recebimento.
              </p>
            </div>

            <div className="px-6 py-3">
              <Input
                label="Buscar repositório"
                value={repoBusca}
                onChange={(e) => setRepoBusca(e.target.value)}
                placeholder="ID GED, unidade ou projeto"
              />
            </div>

            <div className="flex-1 overflow-auto px-6 pb-3">
              {reposFiltrados.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  Nenhum Repositório encontrado na Etapa de Recebimento.
                </p>
              ) : (
                <div className="space-y-2">
                  {reposFiltrados.map((repo) => (
                    <label
                      key={repo.id_repositorio_recorda}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        repoSelecionado === repo.id_repositorio_recorda
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="repo-vincular"
                        checked={repoSelecionado === repo.id_repositorio_recorda}
                        onChange={() => setRepoSelecionado(repo.id_repositorio_recorda)}
                        className="text-blue-600"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{repo.id_repositorio_ged}</span>
                        <span className="text-xs text-gray-500 ml-2">{repo.orgao}</span>
                        <p className="text-xs text-gray-500">{repo.projeto}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVincularModalOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => void handleConfirmarVincular()}
                loading={processando}
                disabled={!repoSelecionado}
              >
                Vincular
              </Button>
            </div>
          </div>
        </div>
      )}

      <RecebimentoLoteModal
        open={loteModalOpen}
        onClose={() => setLoteModalOpen(false)}
        onSaved={() => invalidateAvulsos()}
      />

      <ConfirmDialog
        state={confirmDialog.state}
        loading={confirmDialog.loading}
        onConfirm={() => void confirmDialog.handleConfirm()}
        onCancel={confirmDialog.close}
      />
    </div>
  );
}
