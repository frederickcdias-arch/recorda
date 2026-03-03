import type { DatabaseClient } from './repositorio-repository.js';

export interface LoteCQRow {
  id: string;
  codigo: string;
  status: 'ABERTO' | 'FECHADO';
  auditor_id: string | null;
  auditor_nome?: string;
  data_criacao: string;
  data_fechamento: string | null;
  total_itens?: number;
}

export interface LoteItemCQRow {
  id: string;
  lote_id: string;
  ordem: number;
  resultado: string;
  motivo_codigo: string | null;
  repositorio_id: string;
  id_repositorio_ged?: string;
  orgao?: string;
  projeto?: string;
  status_atual?: string;
}

export class LoteCQRepository {
  constructor(private db: DatabaseClient) {}

  async list(): Promise<LoteCQRow[]> {
    const result = await this.db.query<LoteCQRow>(
      `SELECT l.id, l.codigo, l.status, l.auditor_id, u.nome as auditor_nome,
              l.data_criacao, l.data_fechamento,
              (SELECT COUNT(*) FROM lotes_controle_qualidade_itens i WHERE i.lote_id = l.id)::int as total_itens
       FROM lotes_controle_qualidade l
       LEFT JOIN usuarios u ON u.id = l.auditor_id
       ORDER BY l.data_criacao DESC`
    );
    return result.rows;
  }

  async findById(id: string): Promise<LoteCQRow | null> {
    const result = await this.db.query<LoteCQRow>(
      `SELECT l.id, l.codigo, l.status, l.auditor_id, u.nome as auditor_nome,
              l.data_criacao, l.data_fechamento
       FROM lotes_controle_qualidade l
       LEFT JOIN usuarios u ON u.id = l.auditor_id
       WHERE l.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findItemsByLoteId(loteId: string): Promise<LoteItemCQRow[]> {
    const result = await this.db.query<LoteItemCQRow>(
      `SELECT i.id, i.lote_id, i.ordem, i.resultado, i.motivo_codigo, i.repositorio_id,
              r.id_repositorio_ged, r.orgao, r.projeto, r.status_atual
       FROM lotes_controle_qualidade_itens i
       JOIN repositorios r ON r.id_repositorio_recorda = i.repositorio_id
       WHERE i.lote_id = $1
       ORDER BY i.ordem`,
      [loteId]
    );
    return result.rows;
  }

  async create(data: {
    codigo: string;
    repositorioIds: string[];
    auditorId: string;
  }): Promise<LoteCQRow> {
    const result = await this.db.query<LoteCQRow>(
      `INSERT INTO lotes_controle_qualidade (codigo, auditor_id)
       VALUES ($1, $2)
       RETURNING id, codigo, status, auditor_id, data_criacao, data_fechamento`,
      [data.codigo, data.auditorId]
    );
    const lote = result.rows[0];
    if (!lote) throw new Error('Falha ao criar lote CQ');

    for (let i = 0; i < data.repositorioIds.length; i++) {
      await this.db.query(
        `INSERT INTO lotes_controle_qualidade_itens (lote_id, repositorio_id, ordem)
         VALUES ($1, $2, $3)`,
        [lote.id, data.repositorioIds[i], i + 1]
      );
    }

    return lote;
  }

  async updateItemResultado(
    loteId: string,
    itemId: string,
    resultado: string,
    motivoCodigo?: string | null
  ): Promise<LoteItemCQRow | null> {
    const result = await this.db.query<LoteItemCQRow>(
      `UPDATE lotes_controle_qualidade_itens
       SET resultado = $1, motivo_codigo = $2
       WHERE id = $3 AND lote_id = $4
       RETURNING id, lote_id, ordem, resultado, motivo_codigo, repositorio_id`,
      [resultado, motivoCodigo ?? null, itemId, loteId]
    );
    return result.rows[0] ?? null;
  }

  async fechar(id: string): Promise<LoteCQRow | null> {
    const result = await this.db.query<LoteCQRow>(
      `UPDATE lotes_controle_qualidade
       SET status = 'FECHADO', data_fechamento = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, codigo, status, auditor_id, data_criacao, data_fechamento`,
      [id]
    );
    return result.rows[0] ?? null;
  }
}
