import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import { importacaoLegadoSchema, importacaoLegadoRecebimentoSchema, importacaoLegadoProducaoSchema } from '../schemas/operacional.js';
import {
  type EtapaFluxo,
  type StatusRepositorio,
  getCurrentUser,
  getBrazilDateString,
} from './operacional-helpers.js';
import { normalizeIdRepositorioGed } from './operacional-repositorios.js';

/**
 * Importação legado routes: validar, importar recebimento, importar produção, listar, limpar.
 */
// Helper function to import production from URL
async function importarProducaoLegado(server: FastifyInstance, user: any, url: string): Promise<{ importados: number; duplicados: number; erros: number }> {
  try {
    // Handle Google Sheets redirect
    let csvData: string = '';
    if (url.includes('docs.google.com/spreadsheets/')) {
      // Extract sheet ID and create export URL
      const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (sheetIdMatch) {
        const sheetId = sheetIdMatch[1];
        const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        
        // Follow redirects manually
        let finalUrl = exportUrl;
        let maxRedirects = 5;
        
        while (maxRedirects > 0) {
          const response = await fetch(finalUrl, { redirect: 'manual' });
          
          if (response.status === 302 || response.status === 307) {
            const location = response.headers.get('location');
            if (location) {
              finalUrl = location;
              maxRedirects--;
            } else {
              throw new Error('Redirecionamento sem localização');
            }
          } else if (response.ok) {
            csvData = await response.text();
            break;
          } else {
            throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
          }
        }
        
        if (maxRedirects === 0) {
          throw new Error('Muitos redirecionamentos');
        }
      } else {
        throw new Error('URL do Google Sheets inválida');
      }
    } else {
      // Regular URL fetch
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }
      csvData = await response.text();
    }

    const lines = csvData.split('\n').map((l: string) => l.trim()).filter((l: string) => l);

    // Parse CSV (same logic as existing)
    const normalizeH = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const headersRaw = lines[0]!.split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
    const headers = headersRaw.map(normalizeH);
    const indexOf = (aliases: string[]) => headers.findIndex((h: string) => aliases.includes(h));

    const idxData = indexOf(['data', 'date']);
    const idxColaborador = indexOf(['colaborador', 'nome', 'funcionario']);
    const idxFuncao = indexOf(['funcao', 'função', 'cargo']);
    const idxRepositorio = indexOf(['repositorio', 'repositório', 'repo', 'protocolo', 'numero', 'número', 'id', 'identificacao']);
    const idxCoordenadoria = indexOf(['coordenadoria', 'coord', 'unidade']);
    const idxQuantidade = indexOf(['quantidade', 'qtd', 'qtde']);
    const idxTipo = indexOf(['tipo']);

    if (idxRepositorio < 0 || idxColaborador < 0) {
      throw new Error('Planilha inválida');
    }

    interface ParsedRow {
      data: string; colaborador: string; funcao: string; repositorio: string;
      coordenadoria: string; quantidade: string; tipo: string;
    }
    const registros: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const colaborador = (cols[idxColaborador] ?? '').trim();
      const repositorio = (cols[idxRepositorio] ?? '').trim();
      if (!colaborador || !repositorio) continue;
      registros.push({
        data: idxData >= 0 ? (cols[idxData] ?? '').trim() : '',
        colaborador,
        funcao: idxFuncao >= 0 ? (cols[idxFuncao] ?? '').trim() : '',
        repositorio,
        coordenadoria: idxCoordenadoria >= 0 ? (cols[idxCoordenadoria] ?? '').trim() : '',
        quantidade: idxQuantidade >= 0 ? (cols[idxQuantidade] ?? '1').trim() || '1' : '1',
        tipo: idxTipo >= 0 ? (cols[idxTipo] ?? '').trim() : '',
      });
    }

    // Use the same import logic as the main import function
    const funcaoToEtapa = (funcao: string): string => {
      const f = funcao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      if (f.includes('receb')) return 'RECEBIMENTO';
      if (f.includes('prepar')) return 'PREPARACAO';
      if (f.includes('digital')) return 'DIGITALIZACAO';
      if (f.includes('confer')) return 'CONFERENCIA';
      if (f.includes('montag')) return 'MONTAGEM';
      if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
      if (f.includes('entreg')) return 'ENTREGA';
      return 'RECEBIMENTO';
    };

    // Get users
    const usuariosResult = await server.database.query<{ id: string; nome: string }>(
      `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
    );
    const usuariosPorNome = new Map<string, string>();
    for (const u of usuariosResult.rows) {
      usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
    }

    let sucesso = 0;
    let duplicados = 0;
    const erros: Array<{ linha: number; erro: string }> = [];

    await server.database.query('BEGIN');
    try {
      await server.database.query(`SET LOCAL session_replication_role = 'replica'`);

      for (let idx = 0; idx < registros.length; idx++) {
        const row = registros[idx]!;
        const quantidade = Math.max(Math.round(Number(row.quantidade.replace(/\./g, '').replace(',', '.') || '1')), 1);
        const colaboradorNome = row.colaborador;
        const dataStr = row.data;
        const etapaImport = funcaoToEtapa(row.funcao);

        try {
          // Resolve collaborator
          let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
          if (!colaboradorId) {
            for (const [nome, uid] of usuariosPorNome.entries()) {
              if (nome.includes(colaboradorNome.toLowerCase()) || colaboradorNome.toLowerCase().includes(nome)) {
                colaboradorId = uid;
                break;
              }
            }
          }
          if (!colaboradorId) colaboradorId = user.id;

          // Parse date
          let dataProducaoStr: string;
          if (dataStr) {
            if (dataStr.includes('/')) {
              const parts = dataStr.split('/');
              const dd = (parts[0] ?? '').padStart(2, '0');
              const mm = (parts[1] ?? '').padStart(2, '0');
              let yyyy = parts[2] ?? '';
              if (yyyy.length === 2) {
                yyyy = (parseInt(yyyy, 10) > 50 ? '19' : '20') + yyyy;
              }
              if (!yyyy || yyyy.length < 4) {
                yyyy = String(new Date().getFullYear());
              }
              dataProducaoStr = `${yyyy}-${mm}-${dd}`;
            } else {
              dataProducaoStr = dataStr;
            }
          } else {
            dataProducaoStr = new Date().toISOString().split('T')[0]!;
          }

          // Parse repository ID
          let repoId = row.repositorio.replace(/\s/g, '').trim();
          if (!repoId.includes('/')) {
            const anoRef = new Date().getFullYear();
            repoId = `${repoId.padStart(6, '0')}/${anoRef}`;
          }

          // Find repository
          const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
            `SELECT id_repositorio_recorda FROM repositorios WHERE id_repositorio_ged = $1`,
            [repoId]
          );
          if (repoResult.rows.length === 0) {
            erros.push({
              linha: idx + 1,
              erro: `Repositório não encontrado: ${repoId}`
            });
            continue;
          }
          const repositorioId = repoResult.rows[0]!.id_repositorio_recorda;

          // Check for duplicate
          const existente = await server.database.query<{ id: string }>(
            `SELECT id FROM producao_repositorio
             WHERE usuario_id = $1 AND repositorio_id = $2 AND (data_producao AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
               AND etapa = $4 AND quantidade = $5
               AND COALESCE(marcadores->>'tipo', '') = $6
               AND COALESCE(marcadores->>'funcao', '') = $7
               AND COALESCE(marcadores->>'coordenadoria', '') = $8
               AND COALESCE(marcadores->>'colaborador_nome', '') = $9
             LIMIT 1`,
            [colaboradorId, repositorioId, dataProducaoStr, etapaImport, quantidade, 
             (row.tipo || '').trim(), (row.funcao || '').trim(), (row.coordenadoria || '').trim(), colaboradorNome.trim()]
          );

          if (existente.rows.length > 0) {
            duplicados++;
            continue;
          }

          sucesso++;
        } catch (error) {
          erros.push({
            linha: idx + 1,
            erro: error instanceof Error ? error.message : 'Erro desconhecido'
          });
        }
      }

      await server.database.query('COMMIT');
    } catch (error) {
      await server.database.query('ROLLBACK');
      throw error;
    }

    return { importados: sucesso, duplicados, erros: erros.length };
  } catch (error) {
    throw new Error(`Erro ao importar de ${url}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

export function createOperacionalImportacaoLegadoRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {

    // POST /operacional/importacoes-legado/validar - Validar duplicidades antes de importar
    server.post('/operacional/importacoes-legado/validar', {
      schema: { tags: ['operacional'], summary: 'Validar duplicidades antes de importar legado', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(importacaoLegadoSchema)],
    }, async (request, reply) => {
      try {
        const body = request.body as {
          tipo: 'recebimento' | 'producao';
          etapa?: string;
          registros: Array<Record<string, unknown>>;
        };

        const { tipo, registros } = body;
        if (!registros || registros.length === 0) {
          return reply.status(400).send({ error: 'Nenhum registro para validar' });
        }

        const duplicadasPlanilha: number[] = [];
        const duplicadasBanco: number[] = [];

        if (tipo === 'recebimento') {
          // Detectar duplicatas intra-planilha por (repositorio, processo, interessado)
          const vistos = new Map<string, number>();
          for (let i = 0; i < registros.length; i++) {
            const row = registros[i] as Record<string, string | undefined>;
            const repo = (row.idRepositorioGed ?? '').trim().toLowerCase();
            const processo = (row.processo ?? '').trim().toLowerCase();
            const interessado = (row.interessado ?? '').trim().toLowerCase();
            const chave = `${repo}|${processo}|${interessado}`;
            if (vistos.has(chave)) {
              duplicadasPlanilha.push(i + 1);
              const primeiraLinha = vistos.get(chave)!;
              if (!duplicadasPlanilha.includes(primeiraLinha)) {
                duplicadasPlanilha.push(primeiraLinha);
              }
            } else {
              vistos.set(chave, i + 1);
            }
          }

          // Detectar duplicatas contra o banco (repositório + processo já existente)
          const repoIds = [...new Set(registros.map(r => {
            const raw = ((r as Record<string, string>).idRepositorioGed ?? '').trim();
            return raw ? normalizeIdRepositorioGed(raw) : '';
          }).filter(Boolean))];

          if (repoIds.length > 0) {
            const existentes = await server.database.query<{ id_repositorio_ged: string; processo: string }>(
              `SELECT r.id_repositorio_ged, rd.processo
               FROM recebimento_documentos rd
               JOIN repositorios r ON r.id_repositorio_recorda = rd.repositorio_id
               WHERE r.id_repositorio_ged = ANY($1)`,
              [repoIds]
            );
            const existentesSet = new Set(
              existentes.rows.map(e => `${e.id_repositorio_ged.toLowerCase()}|${e.processo.toLowerCase()}`)
            );

            for (let i = 0; i < registros.length; i++) {
              const row = registros[i] as Record<string, string | undefined>;
              const repo = normalizeIdRepositorioGed((row.idRepositorioGed ?? '').trim());
              const processo = (row.processo ?? '').trim().toLowerCase();
              const chave = `${repo.toLowerCase()}|${processo}`;
              if (existentesSet.has(chave)) {
                duplicadasBanco.push(i + 1);
              }
            }
          }
        } else {
          // Produção: duplicata intra-planilha por (data, colaborador, repositorio, quantidade, tipo, funcao)
          const vistos = new Map<string, number>();
          for (let i = 0; i < registros.length; i++) {
            const row = registros[i] as Record<string, string | undefined>;
            const data = (row.data ?? '').trim().toLowerCase();
            const colaborador = (row.colaborador ?? '').trim().toLowerCase();
            const repo = (row.repositorio ?? '').trim().toLowerCase();
            const quantidade = (row.quantidade ?? '').toString().trim();
            const tipoVal = (row.tipo ?? '').trim().toLowerCase();
            const funcaoVal = (row.funcao ?? '').trim().toLowerCase();
            const chave = `${data}|${colaborador}|${repo}|${quantidade}|${tipoVal}|${funcaoVal}`;
            if (vistos.has(chave)) {
              duplicadasPlanilha.push(i + 1);
              const primeiraLinha = vistos.get(chave)!;
              if (!duplicadasPlanilha.includes(primeiraLinha)) {
                duplicadasPlanilha.push(primeiraLinha);
              }
            } else {
              vistos.set(chave, i + 1);
            }
          }

          // Produção: duplicata contra o banco (inclui etapa derivada da funcao)
          const repoIds = [...new Set(registros.map(r => {
            const raw = ((r as Record<string, string>).repositorio ?? '').trim();
            return raw ? normalizeIdRepositorioGed(raw) : '';
          }).filter(Boolean))];

          if (repoIds.length > 0) {
            const existentes = await server.database.query<{
              id_repositorio_ged: string;
              usuario_nome: string;
              quantidade: number;
              data_producao: string;
              tipo_marcador: string;
              etapa: string;
            }>(
              `SELECT r.id_repositorio_ged,
                      u.nome as usuario_nome,
                      p.quantidade,
                      p.data_producao::text,
                      COALESCE(p.marcadores->>'tipo', '') as tipo_marcador,
                      p.etapa::text as etapa
               FROM producao_repositorio p
               JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
               JOIN usuarios u ON u.id = p.usuario_id
               WHERE r.id_repositorio_ged = ANY($1)`,
              [repoIds]
            );

            const existentesSet = new Set(
              existentes.rows.map(e => {
                const dataStr = e.data_producao.substring(0, 10);
                return `${e.id_repositorio_ged.toLowerCase()}|${e.usuario_nome.toLowerCase()}|${e.quantidade}|${dataStr}|${e.tipo_marcador.toLowerCase()}|${e.etapa}`;
              })
            );

            // Reuse funcaoToEtapa mapping for validation
            const validEtapas: EtapaFluxo[] = ['RECEBIMENTO', 'PREPARACAO', 'DIGITALIZACAO', 'CONFERENCIA', 'MONTAGEM', 'CONTROLE_QUALIDADE', 'ENTREGA'];
            const funcaoToEtapaVal = (funcao: string): EtapaFluxo => {
              const f = funcao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              if (f.includes('receb')) return 'RECEBIMENTO';
              if (f.includes('prepar')) return 'PREPARACAO';
              if (f.includes('digital')) return 'DIGITALIZACAO';
              if (f.includes('confer')) return 'CONFERENCIA';
              if (f.includes('montag')) return 'MONTAGEM';
              if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
              if (f.includes('entreg')) return 'ENTREGA';
              const fallback = (body.etapa ?? 'RECEBIMENTO').toUpperCase() as EtapaFluxo;
              return validEtapas.includes(fallback) ? fallback : 'RECEBIMENTO';
            };

            for (let i = 0; i < registros.length; i++) {
              const row = registros[i] as Record<string, string | undefined>;
              const repo = normalizeIdRepositorioGed((row.repositorio ?? '').trim());
              const colaborador = (row.colaborador ?? '').trim().toLowerCase();
              const quantidadeRaw = String(row.quantidade ?? '1').trim().replace(/\./g, '').replace(',', '.');
              const quantidade = Math.max(Math.round(Number(quantidadeRaw) || 1), 1);
              const tipoVal = (row.tipo ?? '').trim().toLowerCase();
              const etapaVal = funcaoToEtapaVal((row.funcao ?? '').trim());

              // Normalizar data para YYYY-MM-DD
              let dataStr = (row.data ?? '').trim();
              if (dataStr.includes('/')) {
                const parts = dataStr.split('/');
                dataStr = `${parts[2]}-${parts[1]?.padStart(2, '0')}-${parts[0]?.padStart(2, '0')}`;
              }

              const chave = `${repo.toLowerCase()}|${colaborador}|${quantidade}|${dataStr}|${tipoVal}|${etapaVal}`;
              if (existentesSet.has(chave)) {
                duplicadasBanco.push(i + 1);
              }
            }
          }
        }

        const duplicadasPlanilhaSorted = [...new Set(duplicadasPlanilha)].sort((a, b) => a - b);
        const duplicadasBancoSorted = [...new Set(duplicadasBanco)].sort((a, b) => a - b);
        const todasDuplicadas = [...new Set([...duplicadasPlanilhaSorted, ...duplicadasBancoSorted])].sort((a, b) => a - b);

        return reply.send({
          totalRegistros: registros.length,
          duplicadasPlanilha: duplicadasPlanilhaSorted,
          duplicadasBanco: duplicadasBancoSorted,
          todasDuplicadas,
          registrosValidos: registros.length - todasDuplicadas.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao validar duplicidades';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/importacoes-legado/recebimento
    server.post('/operacional/importacoes-legado/recebimento', {
      schema: { tags: ['operacional'], summary: 'Importar recebimento legado', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(importacaoLegadoRecebimentoSchema)],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const body = request.body as {
          usuarioId?: string;
          registros?: Array<{
            idRepositorioGed?: string;
            orgao?: string;
            projeto?: string;
            processo?: string;
            interessado?: string;
            numeroCaixas?: number;
            volume?: string;
            caixaNova?: boolean;
          }>;
        };

        const registros = body.registros ?? [];
        if (registros.length === 0) {
          return reply.status(400).send({ error: 'Informe ao menos um registro para importar' });
        }

        const usuarioDestinoId = body.usuarioId?.trim() || user.id;
        if (usuarioDestinoId !== user.id && user.perfil !== 'administrador') {
          return reply.status(403).send({ error: 'Apenas administradores podem importar para outro usuario' });
        }

        const usuarioDestinoResult = await server.database.query<{ id: string }>(
          `SELECT id FROM usuarios WHERE id = $1 AND ativo = TRUE`,
          [usuarioDestinoId]
        );
        if (usuarioDestinoResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Usuario destino nao encontrado ou inativo' });
        }

        const erros: Array<{ linha: number; idRepositorioGed: string; erro: string }> = [];
        let sucesso = 0;

        for (let idx = 0; idx < registros.length; idx++) {
          const row = registros[idx];
          const linha = idx + 1;
          if (!row) {
            erros.push({ linha, idRepositorioGed: '', erro: 'Registro legado invalido' });
            continue;
          }
          const idRepositorioGedRaw = row.idRepositorioGed?.trim() ?? '';
          const processo = row.processo?.trim() ?? '';
          const interessado = row.interessado?.trim() ?? '';

          if (!idRepositorioGedRaw || !processo || !interessado) {
            erros.push({ linha, idRepositorioGed: idRepositorioGedRaw, erro: 'Campos obrigatorios por linha: idRepositorioGed, processo, interessado' });
            continue;
          }

          const idRepositorioGed = normalizeIdRepositorioGed(idRepositorioGedRaw);

          try {
            const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
              `SELECT id_repositorio_recorda FROM repositorios WHERE id_repositorio_ged = $1`,
              [idRepositorioGed]
            );

            let repositorioId = repoResult.rows[0]?.id_repositorio_recorda ?? '';
            if (!repositorioId) {
              const createdRepo = await server.database.query<{ id_repositorio_recorda: string }>(
                `INSERT INTO repositorios (
                   id_repositorio_ged, orgao, projeto, status_atual, etapa_atual
                 ) VALUES ($1, $2, $3, 'RECEBIDO', 'RECEBIMENTO')
                 RETURNING id_repositorio_recorda`,
                [idRepositorioGed, row.orgao?.trim() ?? 'NAO INFORMADO', row.projeto?.trim() ?? 'LEGADO']
              );
              repositorioId = createdRepo.rows[0]?.id_repositorio_recorda ?? '';
            }

            // Verificar se já existe recebimento idêntico (mesmo repositório, processo, interessado)
            const existenteRec = await server.database.query<{ id: string }>(
              `SELECT id FROM recebimento_documentos
               WHERE repositorio_id = $1 AND processo = $2 AND interessado = $3
               LIMIT 1`,
              [repositorioId, processo, interessado]
            );

            const numCaixas = Math.max(Number(row.numeroCaixas ?? 1), 1);
            const volume = (row.volume ?? '1').trim();
            const caixaNova = Boolean(row.caixaNova);

            if (existenteRec.rows.length > 0) {
              await server.database.query(
                `UPDATE recebimento_documentos
                 SET numero_caixas = $1, volume = $2, caixa_nova = $3
                 WHERE id = $4`,
                [numCaixas, volume, caixaNova, existenteRec.rows[0]!.id]
              );
            } else {
              await server.database.query(
                `INSERT INTO recebimento_documentos (
                   repositorio_id, processo, interessado, numero_caixas, volume, caixa_nova,
                   origem, texto_extraido, criado_por
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, 'LEGADO', '', $7)`,
                [repositorioId, processo, interessado, numCaixas, volume, caixaNova, usuarioDestinoId]
              );
            }
            sucesso++;
          } catch (error) {
            erros.push({
              linha,
              idRepositorioGed,
              erro: error instanceof Error ? error.message : 'Erro ao importar linha',
            });
          }
        }

        const erroCount = erros.length;
        const importacaoResult = await server.database.query<{ id: string; criado_em: string }>(
          `INSERT INTO importacoes_legado_operacional (
             tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
           )
           VALUES ('RECEBIMENTO', $1, $2, $3, $4::jsonb, $5, $6)
           RETURNING id, criado_em`,
          [registros.length, sucesso, erroCount, JSON.stringify(erros), usuarioDestinoId, user.id]
        );

        return reply.status(201).send({
          importacaoId: importacaoResult.rows[0]?.id,
          criadoEm: importacaoResult.rows[0]?.criado_em,
          totalRegistros: registros.length,
          registrosSucesso: sucesso,
          registrosErro: erroCount,
          erros,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao importar legado de recebimento';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/importacoes-legado/producao - Importar produção legada de colaboradores
    server.post('/operacional/importacoes-legado/producao', {
      schema: { tags: ['operacional'], summary: 'Importar produção legada de colaboradores', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(importacaoLegadoProducaoSchema)],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const body = request.body as {
          usuarioId?: string;
          etapa?: string;
          registros?: Array<{
            data?: string;
            colaborador?: string;
            funcao?: string;
            repositorio?: string;
            coordenadoria?: string;
            quantidade?: number;
            tipo?: string;
          }>;
        };

        const registros = body.registros ?? [];
        if (registros.length === 0) {
          return reply.status(400).send({ error: 'Informe ao menos um registro para importar' });
        }

        const validEtapas: EtapaFluxo[] = ['RECEBIMENTO', 'PREPARACAO', 'DIGITALIZACAO', 'CONFERENCIA', 'MONTAGEM', 'CONTROLE_QUALIDADE', 'ENTREGA'];
        const etapaStatusMap: Record<string, StatusRepositorio> = {
          RECEBIMENTO: 'RECEBIDO',
          PREPARACAO: 'EM_PREPARACAO',
          DIGITALIZACAO: 'EM_DIGITALIZACAO',
          CONFERENCIA: 'EM_CONFERENCIA',
          MONTAGEM: 'EM_MONTAGEM',
          CONTROLE_QUALIDADE: 'EM_CQ',
          ENTREGA: 'EM_ENTREGA',
        };
        // Map funcao text to etapa enum
        const funcaoToEtapa = (funcao: string): EtapaFluxo => {
          const f = funcao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
          if (f.includes('receb')) return 'RECEBIMENTO';
          if (f.includes('prepar')) return 'PREPARACAO';
          if (f.includes('digital')) return 'DIGITALIZACAO';
          if (f.includes('confer')) return 'CONFERENCIA';
          if (f.includes('montag')) return 'MONTAGEM';
          if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
          if (f.includes('entreg')) return 'ENTREGA';
          // Fallback: use body.etapa if provided, else RECEBIMENTO
          const fallback = (body.etapa ?? 'RECEBIMENTO').toUpperCase() as EtapaFluxo;
          return validEtapas.includes(fallback) ? fallback : 'RECEBIMENTO';
        };

        const usuarioDestinoId = body.usuarioId?.trim() || user.id;
        if (usuarioDestinoId !== user.id && user.perfil !== 'administrador') {
          return reply.status(403).send({ error: 'Apenas administradores podem importar para outro usuário' });
        }

        // Buscar mapeamento de colaboradores por nome
        const usuariosResult = await server.database.query<{ id: string; nome: string }>(
          `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
        );
        const usuariosPorNome = new Map<string, string>();
        for (const u of usuariosResult.rows) {
          usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
        }

        const erros: Array<{ linha: number; erro: string }> = [];
        let sucesso = 0;

        await server.database.query('BEGIN');
        try {
          // Desabilitar triggers apenas nesta transação (seguro: reverte automaticamente no ROLLBACK)
          await server.database.query(`SET LOCAL session_replication_role = 'replica'`);

          for (let idx = 0; idx < registros.length; idx++) {
            const row = registros[idx];
            const linha = idx + 1;
            if (!row) {
              erros.push({ linha, erro: 'Registro inválido' });
              continue;
            }

            const repoIdentificadorRaw = (row.repositorio ?? '').trim();
            const quantidadeRaw = String(row.quantidade ?? '1').trim().replace(/\./g, '').replace(',', '.');
            const quantidade = Math.max(Math.round(Number(quantidadeRaw) || 1), 1);
            const colaboradorNome = (row.colaborador ?? '').trim();
            const dataStr = (row.data ?? '').trim();
            const etapaImport = funcaoToEtapa((row.funcao ?? '').trim());
            const statusImport = etapaStatusMap[etapaImport] ?? 'RECEBIDO';

            if (!repoIdentificadorRaw) {
              erros.push({ linha, erro: 'Coluna repositório é obrigatória' });
              continue;
            }
            if (!colaboradorNome) {
              erros.push({ linha, erro: 'Coluna colaborador é obrigatória' });
              continue;
            }

            // Resolver usuário pelo nome do colaborador
            let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
            if (!colaboradorId) {
              // Fallback: busca parcial
              for (const [nome, id] of usuariosPorNome.entries()) {
                if (nome.includes(colaboradorNome.toLowerCase()) || colaboradorNome.toLowerCase().includes(nome)) {
                  colaboradorId = id;
                  break;
                }
              }
            }
            if (!colaboradorId) {
              colaboradorId = usuarioDestinoId;
            }

            // Extrair ano da data de produção para normalização do ID
            let anoRef = new Date().getFullYear();
            if (dataStr) {
              if (dataStr.includes('/')) {
                const parts = dataStr.split('/');
                const anoStr = parts[2] ?? '';
                const parsed = parseInt(anoStr, 10);
                if (!isNaN(parsed)) anoRef = parsed < 100 ? 2000 + parsed : parsed;
              } else {
                const parsed = new Date(dataStr);
                if (!isNaN(parsed.getTime())) anoRef = parsed.getFullYear();
              }
            }
            const repoIdentificador = normalizeIdRepositorioGed(repoIdentificadorRaw, anoRef);

            try {
              // Buscar repositório existente pelo ID normalizado
              const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
                `SELECT id_repositorio_recorda FROM repositorios
                 WHERE id_repositorio_ged = $1`,
                [repoIdentificador]
              );

              let repositorioId = repoResult.rows[0]?.id_repositorio_recorda ?? '';
              if (!repositorioId) {
                // Criar repositório legado automaticamente
                const orgao = (row.coordenadoria ?? '').trim() || 'NAO INFORMADO';
                const createdRepo = await server.database.query<{ id_repositorio_recorda: string }>(
                  `INSERT INTO repositorios (
                     id_repositorio_ged, orgao, projeto, status_atual, etapa_atual
                   ) VALUES ($1, $2, 'LEGADO', $3, $4)
                   ON CONFLICT (id_repositorio_ged) DO UPDATE SET id_repositorio_ged = EXCLUDED.id_repositorio_ged
                   RETURNING id_repositorio_recorda`,
                  [repoIdentificador, orgao, statusImport, etapaImport]
                );
                repositorioId = createdRepo.rows[0]?.id_repositorio_recorda ?? '';
              }

              // Buscar ou criar checklist CONCLUIDO para satisfazer o trigger de validação
              const existingChecklist = await server.database.query<{ id: string }>(
                `SELECT id FROM checklists
                 WHERE repositorio_id = $1 AND etapa = $2
                 LIMIT 1`,
                [repositorioId, etapaImport]
              );
              let checklistId = existingChecklist.rows[0]?.id ?? '';
              if (!checklistId) {
                const checklistResult = await server.database.query<{ id: string }>(
                  `INSERT INTO checklists (repositorio_id, etapa, status, observacao, responsavel_id, ativo, data_conclusao)
                   VALUES ($1, $2, 'CONCLUIDO', 'Importação legada', $3, FALSE, CURRENT_TIMESTAMP)
                   RETURNING id`,
                  [repositorioId, etapaImport, colaboradorId]
                );
                checklistId = checklistResult.rows[0]?.id ?? '';
              }

              // Parsear data — produce YYYY-MM-DD string (NOT a Date object, to avoid pg driver timezone shift)
              let dataProducaoStr: string;
              const currentYear = new Date().getFullYear();
              if (dataStr) {
                if (dataStr.includes('/')) {
                  const parts = dataStr.split('/');
                  const dd = (parts[0] ?? '').padStart(2, '0');
                  const mm = (parts[1] ?? '').padStart(2, '0');
                  let yyyy = parts[2] ?? '';
                  // Handle 2-digit year
                  if (yyyy.length === 2) {
                    yyyy = (parseInt(yyyy, 10) > 50 ? '19' : '20') + yyyy;
                  }
                  // If year is empty, use current year
                  if (!yyyy || yyyy.length < 4) {
                    yyyy = String(currentYear);
                  }
                  dataProducaoStr = `${yyyy}-${mm}-${dd}`;
                } else if (dataStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
                  dataProducaoStr = dataStr;
                } else if (dataStr.match(/^-?\d{1,2}-\d{1,2}$/)) {
                  // Handle incomplete dates like '-11-21' or '11-21' (missing year)
                  const cleanDate = dataStr.replace(/^-/, '');
                  const [mm, dd] = cleanDate.split('-');
                  dataProducaoStr = `${currentYear}-${(mm ?? '01').padStart(2, '0')}-${(dd ?? '01').padStart(2, '0')}`;
                } else {
                  dataProducaoStr = getBrazilDateString();
                }
                if (isNaN(new Date(dataProducaoStr).getTime())) {
                  dataProducaoStr = getBrazilDateString();
                }
              } else {
                dataProducaoStr = getBrazilDateString();
              }

              const marcadores = JSON.stringify({
                origem: 'LEGADO',
                funcao: (row.funcao ?? '').trim(),
                tipo: (row.tipo ?? '').trim(),
                coordenadoria: (row.coordenadoria ?? '').trim(),
                colaborador_nome: colaboradorNome,
              });

              // Verificar se já existe registro idêntico (mesmo colaborador, repositório, data, tipo, etapa, quantidade, função, coordenadoria)
              const tipoMarcador = (row.tipo ?? '').trim();
              const funcaoMarcador = (row.funcao ?? '').trim();
              const coordenadoriaMarcador = (row.coordenadoria ?? '').trim();
              const colaboradorNomeMarcador = (colaboradorNome ?? '').trim();
              
              const existente = await server.database.query<{ id: string }>(
                `SELECT id FROM producao_repositorio
                 WHERE usuario_id = $1
                   AND repositorio_id = $2
                   AND (data_producao AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
                   AND etapa = $4
                   AND quantidade = $5
                   AND COALESCE(marcadores->>'tipo', '') = $6
                   AND COALESCE(marcadores->>'funcao', '') = $7
                   AND COALESCE(marcadores->>'coordenadoria', '') = $8
                   AND COALESCE(marcadores->>'colaborador_nome', '') = $9
                 LIMIT 1`,
                [colaboradorId, repositorioId, dataProducaoStr, etapaImport, quantidade, 
                 tipoMarcador, funcaoMarcador, coordenadoriaMarcador, colaboradorNomeMarcador]
              );

              if (existente.rows.length > 0) {
                // Atualizar registro existente (substituir), incluindo etapa
                await server.database.query(
                  `UPDATE producao_repositorio
                   SET quantidade = $1, marcadores = $2::jsonb, checklist_id = $3, etapa = $5
                   WHERE id = $4`,
                  [quantidade, marcadores, checklistId, existente.rows[0]!.id, etapaImport]
                );
              } else {
                await server.database.query(
                  `INSERT INTO producao_repositorio (
                     repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores, data_producao
                   ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
                  [repositorioId, etapaImport, checklistId, colaboradorId, quantidade, marcadores, dataProducaoStr]
                );
              }

              sucesso++;
            } catch (error) {
              erros.push({
                linha,
                erro: error instanceof Error ? error.message : 'Erro ao importar linha',
              });
            }
          }

          // Fechar todos os checklists legados abertos criados nesta importação
          await server.database.query(
            `UPDATE checklists SET status = 'CONCLUIDO', ativo = FALSE, data_conclusao = CURRENT_TIMESTAMP
             WHERE observacao = 'Importação legada' AND status = 'ABERTO' AND ativo = TRUE`
          );

          await server.database.query('COMMIT');
        } catch (innerError) {
          await server.database.query('ROLLBACK');
          throw innerError;
        }

        const erroCount = erros.length;
        const importacaoResult = await server.database.query<{ id: string; criado_em: string }>(
          `INSERT INTO importacoes_legado_operacional (
             tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
           )
           VALUES ('PRODUCAO', $1, $2, $3, $4::jsonb, $5, $6)
           RETURNING id, criado_em`,
          [registros.length, sucesso, erroCount, JSON.stringify(erros), usuarioDestinoId, user.id]
        );

        return reply.status(201).send({
          importacaoId: importacaoResult.rows[0]?.id,
          criadoEm: importacaoResult.rows[0]?.criado_em,
          totalRegistros: registros.length,
          registrosSucesso: sucesso,
          registrosErro: erroCount,
          erros,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao importar produção legada';
        const stack = error instanceof Error ? error.stack : '';
        request.log.error({ err: error, msg: `Importação produção falhou: ${message}` });
        return reply.status(400).send({ error: message, stack: process.env.NODE_ENV !== 'production' ? stack : undefined });
      }
    });

    // GET /operacional/importacoes-legado
    server.get('/operacional/importacoes-legado', {
      schema: { tags: ['operacional'], summary: 'Listar importações legadas', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const query = request.query as {
          usuarioDestinoId?: string;
          limite?: string | number;
          pagina?: string | number;
        };

        const limite = Math.min(Math.max(Number(query.limite ?? 20), 1), 100);
        const pagina = Math.max(Number(query.pagina ?? 1), 1);
        const offset = (pagina - 1) * limite;
        const params: Array<string | number> = [];
        let where = 'WHERE 1=1';
        let p = 1;

        if (query.usuarioDestinoId?.trim()) {
          if (user.perfil !== 'administrador' && query.usuarioDestinoId !== user.id) {
            return reply.status(403).send({ error: 'Apenas administradores podem consultar outro usuario' });
          }
          where += ` AND i.usuario_destino_id = $${p++}`;
          params.push(query.usuarioDestinoId.trim());
        } else if (user.perfil !== 'administrador') {
          where += ` AND i.usuario_destino_id = $${p++}`;
          params.push(user.id);
        }

        const totalResult = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text as total
           FROM importacoes_legado_operacional i
           ${where}`,
          params
        );
        const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

        params.push(limite, offset);
        const result = await server.database.query(
          `SELECT i.id, i.tipo, i.total_registros, i.registros_sucesso, i.registros_erro, i.detalhes_erros, i.criado_em,
                  i.usuario_destino_id, u.nome as usuario_destino_nome,
                  i.executado_por, e.nome as executado_por_nome
           FROM importacoes_legado_operacional i
           JOIN usuarios u ON u.id = i.usuario_destino_id
           JOIN usuarios e ON e.id = i.executado_por
           ${where}
           ORDER BY i.criado_em DESC
           LIMIT $${p++} OFFSET $${p}`,
          params
        );

        return reply.send({
          itens: result.rows,
          total,
          pagina,
          totalPaginas: Math.ceil(total / limite),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar importacoes legadas';
        return sendDatabaseError(reply, error, message);
      }
    });

    // DELETE /operacional/importacoes-legado/limpar - Limpar todos os dados legados
    server.delete('/operacional/importacoes-legado/limpar', {
      schema: { tags: ['operacional'], summary: 'Limpar todos os dados legados importados', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        await server.database.query('BEGIN');
        const prodResult = await server.database.query('DELETE FROM producao_repositorio');
        const checkResult = await server.database.query("DELETE FROM checklists WHERE observacao = 'Importação legada'");
        const recebResult = await server.database.query('DELETE FROM recebimento_documentos');
        const repoResult = await server.database.query("DELETE FROM repositorios WHERE projeto = 'LEGADO'");
        const importResult = await server.database.query('DELETE FROM importacoes_legado_operacional');
        await server.database.query('COMMIT');

        request.log.info('Limpeza legada completa');
        return reply.send({
          mensagem: 'Todos os dados legados foram removidos com sucesso.',
          removidos: {
            producao: prodResult.rowCount ?? 0,
            checklists: checkResult.rowCount ?? 0,
            recebimentos: recebResult.rowCount ?? 0,
            repositorios: repoResult.rowCount ?? 0,
            importacoes: importResult.rowCount ?? 0,
          },
        });
      } catch (error) {
        await server.database.query('ROLLBACK');
        const message = error instanceof Error ? error.message : 'Erro ao limpar dados legados';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/importacoes-legado/fetch-sheets - Fetch CSV from a published Google Sheets URL
    server.post('/operacional/importacoes-legado/fetch-sheets', {
      schema: { tags: ['operacional'], summary: 'Fetch CSV data from a published Google Sheets URL', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { url } = request.body as { url?: string };
        if (!url || typeof url !== 'string' || !url.trim()) {
          return reply.status(400).send({ error: 'URL é obrigatória' });
        }

        const trimmed = url.trim();
        let csvUrl = trimmed;

        const spreadsheetIdMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        if (spreadsheetIdMatch) {
          const spreadsheetId = spreadsheetIdMatch[1];
          const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
          const gid = gidMatch?.[1] ?? '0';
          csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
        } else if (trimmed.includes('/spreadsheets/d/e/') && !trimmed.includes('output=csv')) {
          csvUrl = trimmed.includes('?') ? `${trimmed}&output=csv` : `${trimmed}?output=csv`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        let response: Response;
        try {
          response = await fetch(csvUrl, { signal: controller.signal, headers: { 'Accept': 'text/csv, text/plain, */*' }, redirect: 'follow' });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const status = response.status;
          if (status === 404) return reply.status(400).send({ error: 'Planilha não encontrada. Verifique se a URL está correta e a planilha está publicada.' });
          if (status === 403 || status === 401) return reply.status(400).send({ error: 'Acesso negado. A planilha precisa estar publicada na web (Arquivo → Compartilhar → Publicar na Web).' });
          return reply.status(400).send({ error: `Erro ao acessar planilha (HTTP ${status}). Verifique se a URL está correta.` });
        }

        const contentType = response.headers.get('content-type') ?? '';
        const csvContent = await response.text();

        if (csvContent.length === 0) return reply.status(400).send({ error: 'A planilha retornou conteúdo vazio.' });
        if (contentType.includes('text/html') && csvContent.includes('<html')) {
          return reply.status(400).send({ error: 'A planilha não está publicada. Publique via Arquivo → Compartilhar → Publicar na Web → CSV.' });
        }

        return reply.send({ csv: csvContent, url: csvUrl });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return reply.status(408).send({ error: 'Timeout ao acessar a planilha. Tente novamente.' });
        const message = error instanceof Error ? error.message : 'Erro ao buscar dados da planilha';
        return sendDatabaseError(reply, error, message);
      }
    });

    // ── Fontes de Importação (saved links) ──

    // GET /operacional/fontes-importacao - List saved import sources
    server.get('/operacional/fontes-importacao', {
      schema: { tags: ['operacional'], summary: 'Listar fontes de importação salvas', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      const result = await server.database.query<{
        id: string; nome: string; url: string; tipo: string;
        criado_em: string; ultima_importacao_em: string | null;
      }>(
        `SELECT id, nome, url, tipo, criado_em, ultima_importacao_em
         FROM fontes_importacao ORDER BY nome`
      );
      return reply.send({ fontes: result.rows });
    });

    // POST /operacional/fontes-importacao - Create a saved import source
    server.post('/operacional/fontes-importacao', {
      schema: { tags: ['operacional'], summary: 'Criar fonte de importação', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      const user = getCurrentUser(request);
      const { nome, url } = request.body as { nome?: string; url?: string };
      if (!nome?.trim() || !url?.trim()) {
        return reply.status(400).send({ error: 'Nome e URL são obrigatórios' });
      }
      const result = await server.database.query<{ id: string }>(
        `INSERT INTO fontes_importacao (nome, url, tipo, criado_por) VALUES ($1, $2, 'sheets', $3) RETURNING id`,
        [nome.trim(), url.trim(), user.id]
      );
      return reply.status(201).send({ id: result.rows[0]!.id });
    });

    // DELETE /operacional/fontes-importacao/:id - Delete a saved import source
    server.delete<{ Params: { id: string } }>('/operacional/fontes-importacao/:id', {
      schema: { tags: ['operacional'], summary: 'Excluir fonte de importação', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      const { id } = request.params;
      await server.database.query('DELETE FROM fontes_importacao WHERE id = $1', [id]);
      return reply.send({ ok: true });
    });

    // POST /operacional/fontes-importacao/:id/validar-duplicatas - Validate duplicates before importing
    server.post<{ Params: { id: string } }>('/operacional/fontes-importacao/:id/validar-duplicatas', {
      schema: { tags: ['operacional'], summary: 'Validar duplicatas antes de importar', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      const { id } = request.params;

      // 1. Fetch the saved source
      const fonteResult = await server.database.query<{ id: string; nome: string; url: string }>(
        `SELECT id, nome, url FROM fontes_importacao WHERE id = $1`, [id]
      );
      if (fonteResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Fonte de importação não encontrada' });
      }
      const fonte = fonteResult.rows[0]!;

      // 2. Fetch CSV data
      const csvData = await fetch(fonte.url).then(r => r.text());
      const lines = csvData.split('\n').map(l => l.trim()).filter(l => l);

      // 3. Parse CSV (same logic as import)
      const normalizeH = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const headersRaw = lines[0]!.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const headers = headersRaw.map(normalizeH);
      const indexOf = (aliases: string[]) => headers.findIndex(h => aliases.includes(h));

      const idxData = indexOf(['data', 'date']);
      const idxColaborador = indexOf(['colaborador', 'nome', 'funcionario']);
      const idxFuncao = indexOf(['funcao', 'função', 'cargo']);
      const idxRepositorio = indexOf(['repositorio', 'repositório', 'repo', 'protocolo', 'numero', 'número', 'id', 'identificacao']);
      const idxCoordenadoria = indexOf(['coordenadoria', 'coord', 'unidade']);
      const idxQuantidade = indexOf(['quantidade', 'qtd', 'qtde']);
      const idxTipo = indexOf(['tipo']);

      if (idxRepositorio < 0 || idxColaborador < 0) {
        return reply.status(400).send({ error: 'Planilha inválida: colunas obrigatórias Colaborador e Repositório não encontradas.' });
      }

      interface ParsedRow {
        data: string; colaborador: string; funcao: string; repositorio: string;
        coordenadoria: string; quantidade: string; tipo: string;
      }
      const registros: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]!.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const colaborador = (cols[idxColaborador] ?? '').trim();
        const repositorio = (cols[idxRepositorio] ?? '').trim();
        if (!colaborador || !repositorio) continue;
        registros.push({
          data: idxData >= 0 ? (cols[idxData] ?? '').trim() : '',
          colaborador,
          funcao: idxFuncao >= 0 ? (cols[idxFuncao] ?? '').trim() : '',
          repositorio,
          coordenadoria: idxCoordenadoria >= 0 ? (cols[idxCoordenadoria] ?? '').trim() : '',
          quantidade: idxQuantidade >= 0 ? (cols[idxQuantidade] ?? '1').trim() || '1' : '1',
          tipo: idxTipo >= 0 ? (cols[idxTipo] ?? '').trim() : '',
        });
      }

      // 4. Check for duplicates
      const usuariosResult = await server.database.query<{ id: string; nome: string }>(
        `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
      );
      const usuariosPorNome = new Map<string, string>();
      for (const u of usuariosResult.rows) {
        usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
      }

      const funcaoToEtapa = (funcao: string): string => {
        const f = funcao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (f.includes('receb')) return 'RECEBIMENTO';
        if (f.includes('prepar')) return 'PREPARACAO';
        if (f.includes('digital')) return 'DIGITALIZACAO';
        if (f.includes('confer')) return 'CONFERENCIA';
        if (f.includes('montag')) return 'MONTAGEM';
        if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
        if (f.includes('entreg')) return 'ENTREGA';
        return 'RECEBIMENTO';
      };

      const novos: Array<{ linha: number; dados: ParsedRow; motivo: string }> = [];
      const duplicados: Array<{ linha: number; dados: ParsedRow; motivo: string }> = [];

      for (let idx = 0; idx < registros.length; idx++) {
        const row = registros[idx]!;
        const linha = idx + 1;
        
        // Parse repo
        let anoRef = new Date().getFullYear();
        if (row.data.includes('/')) {
          const parts = row.data.split('/');
          const parsed = parseInt(parts[2] ?? '', 10);
          if (!isNaN(parsed)) anoRef = parsed < 100 ? 2000 + parsed : parsed;
        }
        const repoIdentificador = row.repositorio.replace(/\s/g, '').trim();
        const repoId = repoIdentificador.includes('/') 
          ? `${repoIdentificador.split('/')[0]!.padStart(6, '0')}/${repoIdentificador.split('/')[1]}`
          : `${repoIdentificador.padStart(6, '0')}/${anoRef}`;

        // Find repo
        const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
          `SELECT id_repositorio_recorda FROM repositorios WHERE id_repositorio_ged = $1`, [repoId]
        );
        if (repoResult.rows.length === 0) {
          novos.push({ linha, dados: row, motivo: 'Repositório não encontrado' });
          continue;
        }
        const repositorioId = repoResult.rows[0]!.id_repositorio_recorda;

        // Resolve collaborator
        let colaboradorId = usuariosPorNome.get(row.colaborador.toLowerCase());
        if (!colaboradorId) {
          for (const [nome, uid] of usuariosPorNome.entries()) {
            if (nome.includes(row.colaborador.toLowerCase()) || row.colaborador.toLowerCase().includes(nome)) {
              colaboradorId = uid;
              break;
            }
          }
        }
        if (!colaboradorId) colaboradorId = usuariosPorNome.values().next().value;

        // Parse date
        let dataProducaoStr: string;
        if (row.data) {
          if (row.data.includes('/')) {
            const parts = row.data.split('/');
            const dd = (parts[0] ?? '').padStart(2, '0');
            const mm = (parts[1] ?? '').padStart(2, '0');
            let yyyy = parts[2] ?? '';
            if (yyyy.length === 2) {
              yyyy = (parseInt(yyyy, 10) > 50 ? '19' : '20') + yyyy;
            }
            if (!yyyy) yyyy = String(new Date().getFullYear());
            dataProducaoStr = `${yyyy}-${mm}-${dd}`;
          } else {
            dataProducaoStr = row.data;
          }
        } else {
          dataProducaoStr = new Date().toISOString().split('T')[0]!;
        }

        // Check duplicate
        const etapaImport = funcaoToEtapa(row.funcao);
        const quantidade = Math.max(Math.round(Number(row.quantidade.replace(/\./g, '').replace(',', '.') || '1')), 1);
        
        const existente = await server.database.query<{ id: string }>(
          `SELECT id FROM producao_repositorio
           WHERE usuario_id = $1 AND repositorio_id = $2 AND (data_producao AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
             AND etapa = $4 AND quantidade = $5
             AND COALESCE(marcadores->>'tipo', '') = $6
             AND COALESCE(marcadores->>'funcao', '') = $7
             AND COALESCE(marcadores->>'coordenadoria', '') = $8
             AND COALESCE(marcadores->>'colaborador_nome', '') = $9
           LIMIT 1`,
          [colaboradorId, repositorioId, dataProducaoStr, etapaImport, quantidade, 
           (row.tipo || '').trim(), (row.funcao || '').trim(), (row.coordenadoria || '').trim(), row.colaborador.trim()]
        );

        if (existente.rows.length > 0) {
          duplicados.push({ linha, dados: row, motivo: 'Registro já existe no sistema' });
        } else {
          novos.push({ linha, dados: row, motivo: 'Novo registro' });
        }
      }

      return reply.send({
        fonte: { id: fonte.id, nome: fonte.nome },
        total: registros.length,
        novos: { quantidade: novos.length, itens: novos.slice(0, 10) }, // Limit preview to 10
        duplicados: { quantidade: duplicados.length, itens: duplicados.slice(0, 10) }, // Limit preview to 10
      });
    });

    // POST /operacional/fontes-importacao/:id/importar - Fetch & import from a saved source (auto-skip duplicates)
    server.post<{ Params: { id: string } }>('/operacional/fontes-importacao/:id/importar', {
      schema: { tags: ['operacional'], summary: 'Importar dados de uma fonte salva (auto-skip duplicatas)', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      const { id } = request.params;

      // 1. Fetch the saved source
      const fonteResult = await server.database.query<{ id: string; nome: string; url: string }>(
        `SELECT id, nome, url FROM fontes_importacao WHERE id = $1`, [id]
      );
      if (fonteResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Fonte de importação não encontrada' });
      }
      const fonte = fonteResult.rows[0]!;

      // 2. Fetch CSV from Google Sheets
      const trimmed = fonte.url.trim();
      let csvUrl = trimmed;
      const spreadsheetIdMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (spreadsheetIdMatch) {
        const spreadsheetId = spreadsheetIdMatch[1];
        const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
        const gid = gidMatch?.[1] ?? '0';
        csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let csvResponse: Response;
      try {
        csvResponse = await fetch(csvUrl, { signal: controller.signal, headers: { 'Accept': 'text/csv, text/plain, */*' }, redirect: 'follow' });
      } catch (fetchErr) {
        clearTimeout(timeout);
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          return reply.status(408).send({ error: 'Timeout ao acessar a planilha.' });
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeout);
      }

      if (!csvResponse.ok) {
        return reply.status(400).send({ error: `Erro ao acessar planilha (HTTP ${csvResponse.status})` });
      }
      const csvContent = await csvResponse.text();
      if (!csvContent.trim()) {
        return reply.status(400).send({ error: 'A planilha retornou conteúdo vazio.' });
      }

      // 3. Parse CSV (reuse same logic as frontend — header-based)
      const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) {
        return reply.status(400).send({ error: 'Planilha sem dados (apenas cabeçalho ou vazia).' });
      }

      const isTab = lines[0]!.includes('\t');
      const separator = lines[0]!.includes(';') ? ';' : ',';
      const splitLine = (line: string): string[] => {
        if (isTab) return line.split('\t').map(c => c.trim());
        const out: string[] = [];
        let current = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]!;
          if (ch === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i++; } else { quoted = !quoted; } continue; }
          if (ch === separator && !quoted) { out.push(current); current = ''; continue; }
          current += ch;
        }
        out.push(current);
        return out.map(s => s.trim());
      };

      const normalizeH = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const headersRaw = splitLine(lines[0]!);
      const headers = headersRaw.map(normalizeH);
      const indexOf = (aliases: string[]) => headers.findIndex(h => aliases.includes(h));

      const idxData = indexOf(['data', 'date']);
      const idxColaborador = indexOf(['colaborador', 'nome', 'funcionario']);
      const idxFuncao = indexOf(['funcao', 'função', 'cargo']);
      const idxRepositorio = indexOf(['repositorio', 'repositório', 'repo', 'protocolo', 'numero', 'número', 'id', 'identificacao']);
      const idxCoordenadoria = indexOf(['coordenadoria', 'coord', 'unidade']);
      const idxQuantidade = indexOf(['quantidade', 'qtd', 'qtde']);
      const idxTipo = indexOf(['tipo']);

      if (idxRepositorio < 0 || idxColaborador < 0) {
        return reply.status(400).send({ error: 'Planilha inválida: colunas obrigatórias Colaborador e Repositório não encontradas.' });
      }

      interface ParsedRow {
        data: string; colaborador: string; funcao: string; repositorio: string;
        coordenadoria: string; quantidade: string; tipo: string;
      }
      const registros: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = splitLine(lines[i]!);
        const colaborador = (cols[idxColaborador] ?? '').trim();
        const repositorio = (cols[idxRepositorio] ?? '').trim();
        if (!colaborador || !repositorio) continue;
        registros.push({
          data: idxData >= 0 ? (cols[idxData] ?? '').trim() : '',
          colaborador,
          funcao: idxFuncao >= 0 ? (cols[idxFuncao] ?? '').trim() : '',
          repositorio,
          coordenadoria: idxCoordenadoria >= 0 ? (cols[idxCoordenadoria] ?? '').trim() : '',
          quantidade: idxQuantidade >= 0 ? (cols[idxQuantidade] ?? '1').trim() || '1' : '1',
          tipo: idxTipo >= 0 ? (cols[idxTipo] ?? '').trim() : '',
        });
      }

      if (registros.length === 0) {
        return reply.status(400).send({ error: 'Nenhum registro válido encontrado na planilha.' });
      }

      // 4. Import with auto-skip duplicates — delegate to the existing producao import handler logic
      //    but inline it here to auto-skip instead of prompting
      const user = getCurrentUser(request);

      const etapaStatusMap: Record<string, StatusRepositorio> = {
        RECEBIMENTO: 'RECEBIDO', PREPARACAO: 'EM_PREPARACAO', DIGITALIZACAO: 'EM_DIGITALIZACAO',
        CONFERENCIA: 'EM_CONFERENCIA', MONTAGEM: 'EM_MONTAGEM', CONTROLE_QUALIDADE: 'EM_CQ', ENTREGA: 'EM_ENTREGA',
      };
      const funcaoToEtapa = (funcao: string): EtapaFluxo => {
        const f = funcao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (f.includes('receb')) return 'RECEBIMENTO';
        if (f.includes('prepar')) return 'PREPARACAO';
        if (f.includes('digital')) return 'DIGITALIZACAO';
        if (f.includes('confer')) return 'CONFERENCIA';
        if (f.includes('montag')) return 'MONTAGEM';
        if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
        if (f.includes('entreg')) return 'ENTREGA';
        return 'RECEBIMENTO';
      };

      const usuariosResult = await server.database.query<{ id: string; nome: string }>(
        `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
      );
      const usuariosPorNome = new Map<string, string>();
      for (const u of usuariosResult.rows) {
        usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
      }

      let sucesso = 0;
      let duplicados = 0;
      const erros: Array<{ linha: number; erro: string }> = [];

      await server.database.query('BEGIN');
      try {
        // Desabilitar triggers apenas nesta transação (seguro: reverte automaticamente no ROLLBACK)
        await server.database.query(`SET LOCAL session_replication_role = 'replica'`);

        for (let idx = 0; idx < registros.length; idx++) {
          const row = registros[idx]!;
          const linha = idx + 1;
          const repoIdentificadorRaw = row.repositorio;
          const quantidadeRaw = row.quantidade.replace(/\./g, '').replace(',', '.');
          const quantidade = Math.max(Math.round(Number(quantidadeRaw) || 1), 1);
          const colaboradorNome = row.colaborador;
          const dataStr = row.data;
          const etapaImport = funcaoToEtapa(row.funcao);
          const statusImport = etapaStatusMap[etapaImport] ?? 'RECEBIDO';

          // Resolve collaborator
          let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
          if (!colaboradorId) {
            for (const [nome, uid] of usuariosPorNome.entries()) {
              if (nome.includes(colaboradorNome.toLowerCase()) || colaboradorNome.toLowerCase().includes(nome)) {
                colaboradorId = uid;
                break;
              }
            }
          }
          if (!colaboradorId) colaboradorId = user.id;

          // Parse year for repo normalization
          let anoRef = new Date().getFullYear();
          if (dataStr) {
            if (dataStr.includes('/')) {
              const parts = dataStr.split('/');
              const parsed = parseInt(parts[2] ?? '', 10);
              if (!isNaN(parsed)) anoRef = parsed < 100 ? 2000 + parsed : parsed;
            } else {
              const parsed = new Date(dataStr);
              if (!isNaN(parsed.getTime())) anoRef = parsed.getFullYear();
            }
          }
          const repoIdentificador = normalizeIdRepositorioGed(repoIdentificadorRaw, anoRef);

          try {
            // Find or create repo
            const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
              `SELECT id_repositorio_recorda FROM repositorios WHERE id_repositorio_ged = $1`, [repoIdentificador]
            );
            let repositorioId = repoResult.rows[0]?.id_repositorio_recorda ?? '';
            if (!repositorioId) {
              const orgao = row.coordenadoria || 'NAO INFORMADO';
              const createdRepo = await server.database.query<{ id_repositorio_recorda: string }>(
                `INSERT INTO repositorios (id_repositorio_ged, orgao, projeto, status_atual, etapa_atual)
                 VALUES ($1, $2, 'LEGADO', $3, $4)
                 ON CONFLICT (id_repositorio_ged) DO UPDATE SET id_repositorio_ged = EXCLUDED.id_repositorio_ged
                 RETURNING id_repositorio_recorda`,
                [repoIdentificador, orgao, statusImport, etapaImport]
              );
              repositorioId = createdRepo.rows[0]?.id_repositorio_recorda ?? '';
            }

            // Parse date — produce YYYY-MM-DD string (NOT a Date object, to avoid pg driver timezone shift)
            let dataProducaoStr: string;
            const currentYear = new Date().getFullYear();
            if (dataStr) {
              if (dataStr.includes('/')) {
                const parts = dataStr.split('/');
                const dd = (parts[0] ?? '').padStart(2, '0');
                const mm = (parts[1] ?? '').padStart(2, '0');
                let yyyy = parts[2] ?? '';
                // Handle 2-digit year
                if (yyyy.length === 2) {
                  yyyy = (parseInt(yyyy, 10) > 50 ? '19' : '20') + yyyy;
                }
                // If year is empty, use current year
                if (!yyyy || yyyy.length < 4) {
                  yyyy = String(currentYear);
                }
                dataProducaoStr = `${yyyy}-${mm}-${dd}`;
              } else if (dataStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
                dataProducaoStr = dataStr;
              } else if (dataStr.match(/^-?\d{1,2}-\d{1,2}$/)) {
                // Handle incomplete dates like '-11-21' or '11-21' (missing year)
                const cleanDate = dataStr.replace(/^-/, '');
                const [mm, dd] = cleanDate.split('-');
                dataProducaoStr = `${currentYear}-${(mm ?? '01').padStart(2, '0')}-${(dd ?? '01').padStart(2, '0')}`;
              } else {
                dataProducaoStr = getBrazilDateString();
              }
              // Validate it's a real date
              if (isNaN(new Date(dataProducaoStr).getTime())) {
                dataProducaoStr = getBrazilDateString();
              }
            } else {
              dataProducaoStr = getBrazilDateString();
            }

            // Check for duplicate — auto-skip with comprehensive comparison
            const tipoMarcador = (row.tipo || '').trim();
            const funcaoMarcador = (row.funcao || '').trim();
            const coordenadoriaMarcador = (row.coordenadoria || '').trim();
            const colaboradorNomeMarcador = (colaboradorNome || '').trim();
            
            const existente = await server.database.query<{ id: string }>(
              `SELECT id FROM producao_repositorio
               WHERE usuario_id = $1 AND repositorio_id = $2 AND (data_producao AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
                 AND etapa = $4 AND quantidade = $5
                 AND COALESCE(marcadores->>'tipo', '') = $6
                 AND COALESCE(marcadores->>'funcao', '') = $7
                 AND COALESCE(marcadores->>'coordenadoria', '') = $8
                 AND COALESCE(marcadores->>'colaborador_nome', '') = $9
               LIMIT 1`,
              [colaboradorId, repositorioId, dataProducaoStr, etapaImport, quantidade, 
               tipoMarcador, funcaoMarcador, coordenadoriaMarcador, colaboradorNomeMarcador]
            );

            if (existente.rows.length > 0) {
              duplicados++;
              continue; // auto-skip duplicate
            }

            // Find or create checklist (must be CONCLUIDO to satisfy production trigger)
            const existingChecklist = await server.database.query<{ id: string }>(
              `SELECT id FROM checklists WHERE repositorio_id = $1 AND etapa = $2 LIMIT 1`,
              [repositorioId, etapaImport]
            );
            let checklistId = existingChecklist.rows[0]?.id ?? '';
            if (!checklistId) {
              const checklistResult = await server.database.query<{ id: string }>(
                `INSERT INTO checklists (repositorio_id, etapa, status, observacao, responsavel_id, ativo, data_conclusao)
                 VALUES ($1, $2, 'CONCLUIDO', 'Importação legada', $3, FALSE, CURRENT_TIMESTAMP) RETURNING id`,
                [repositorioId, etapaImport, colaboradorId]
              );
              checklistId = checklistResult.rows[0]?.id ?? '';
            }

            const marcadores = JSON.stringify({
              origem: 'LEGADO',
              funcao: row.funcao,
              tipo: row.tipo,
              coordenadoria: row.coordenadoria,
              colaborador_nome: colaboradorNome,
            });

            await server.database.query(
              `INSERT INTO producao_repositorio (
                 repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores, data_producao
               ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
              [repositorioId, etapaImport, checklistId, colaboradorId, quantidade, marcadores, dataProducaoStr]
            );
            sucesso++;
          } catch (error) {
            erros.push({ linha, erro: error instanceof Error ? error.message : 'Erro desconhecido' });
          }
        }

        await server.database.query('COMMIT');
      } catch (innerError) {
        await server.database.query('ROLLBACK');
        throw innerError;
      }

      // Update last import timestamp
      await server.database.query(
        `UPDATE fontes_importacao SET ultima_importacao_em = NOW() WHERE id = $1`, [id]
      );

      // Log the import
      await server.database.query(
        `INSERT INTO importacoes_legado_operacional (
           tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
         ) VALUES ('PRODUCAO', $1, $2, $3, $4::jsonb, $5, $6)`,
        [registros.length, sucesso, erros.length, JSON.stringify(erros), user.id, user.id]
      );

      return reply.send({
        fonte: fonte.nome,
        totalPlanilha: registros.length,
        importados: sucesso,
        duplicados,
        erros: erros.length,
        detalhesErros: erros.slice(0, 10),
      });
    });

    // POST /operacional/fontes-importacao/importar-todas - Import from all saved sources
    server.post('/operacional/fontes-importacao/importar-todas', {
      schema: { tags: ['operacional'], summary: 'Importar de todas as fontes salvas', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      const user = getCurrentUser(request);

      // 1. Get all saved sources
      const fontesResult = await server.database.query<{ id: string; nome: string; url: string }>(
        `SELECT id, nome, url FROM fontes_importacao ORDER BY nome`
      );
      if (fontesResult.rows.length === 0) {
        return reply.status(400).send({ error: 'Nenhuma fonte de importação cadastrada.' });
      }

      const fontes = fontesResult.rows;
      const resultados: Array<{ fonte: string; importados: number; duplicados: number; erros: number; sucesso: boolean; erro?: string }> = [];
      let totalImportados = 0;
      let totalDuplicados = 0;
      let totalErros = 0;

      // 2. Import each source
      for (const fonte of fontes) {
        try {
          // Import using existing logic (reuse the importarFonte logic)
          const importResult = await importarProducaoLegado(server, user, fonte.url);
          
          resultados.push({
            fonte: fonte.nome,
            importados: importResult.importados,
            duplicados: importResult.duplicados,
            erros: importResult.erros,
            sucesso: importResult.erros === 0,
          });
          
          totalImportados += importResult.importados;
          totalDuplicados += importResult.duplicados;
          totalErros += importResult.erros;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          resultados.push({
            fonte: fonte.nome,
            importados: 0,
            duplicados: 0,
            erros: 1,
            sucesso: false,
            erro: errorMessage
          });
          totalErros++;
          
          // Log do erro para debug
          console.error(`Erro ao importar fonte ${fonte.nome}:`, error);
        }
      }

      // 3. Log the bulk import
      await server.database.query(
        `INSERT INTO importacoes_legado_operacional (tipo, total_registros, registros_sucesso, registros_erro, usuario_destino_id, executado_por)
         VALUES ('PRODUCAO_BULK', $1, $2, $3, $4, $5)`,
        [totalImportados + totalDuplicados + totalErros, totalImportados, totalErros, user.id, user.id]
      );

      return reply.send({
        total: fontes.length,
        resultados,
        resumo: {
          importados: totalImportados,
          duplicados: totalDuplicados,
          erros: totalErros,
        },
      });
    });

  };
}

