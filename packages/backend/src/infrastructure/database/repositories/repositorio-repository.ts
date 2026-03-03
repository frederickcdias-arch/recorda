import type { EtapaFluxo, StatusRepositorio } from '@recorda/shared';

export interface DatabaseClient {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
}

export interface RepositorioRow {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
  etapa_atual: EtapaFluxo;
  status_atual: StatusRepositorio;
  armario_codigo?: string | null;
  seadesk_confirmado_em?: string | null;
  seadesk_confirmado_por?: string | null;
}

export class RepositorioRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string): Promise<RepositorioRow | null> {
    const result = await this.db.query<RepositorioRow>(
      `SELECT id_repositorio_recorda, id_repositorio_ged, orgao, projeto,
              etapa_atual, status_atual, armario_codigo,
              seadesk_confirmado_em, seadesk_confirmado_por
       FROM repositorios
       WHERE id_repositorio_recorda = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByGedId(gedId: string): Promise<RepositorioRow | null> {
    const result = await this.db.query<RepositorioRow>(
      `SELECT id_repositorio_recorda, id_repositorio_ged, orgao, projeto,
              etapa_atual, status_atual, armario_codigo,
              seadesk_confirmado_em, seadesk_confirmado_por
       FROM repositorios
       WHERE id_repositorio_ged = $1`,
      [gedId]
    );
    return result.rows[0] ?? null;
  }

  async listByEtapa(
    etapa: EtapaFluxo,
    opts?: { busca?: string; status?: string; limite?: number; pagina?: number }
  ): Promise<{ itens: RepositorioRow[]; total: number }> {
    const limite = opts?.limite ?? 50;
    const pagina = opts?.pagina ?? 1;
    const offset = (pagina - 1) * limite;

    const conditions = ['etapa_atual = $1'];
    const params: unknown[] = [etapa];
    let paramIdx = 2;

    if (opts?.status) {
      conditions.push(`status_atual = $${paramIdx}`);
      params.push(opts.status);
      paramIdx++;
    }

    if (opts?.busca) {
      conditions.push(`(id_repositorio_ged ILIKE $${paramIdx} OR orgao ILIKE $${paramIdx} OR projeto ILIKE $${paramIdx})`);
      params.push(`%${opts.busca}%`);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM repositorios WHERE ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    params.push(limite, offset);
    const result = await this.db.query<RepositorioRow>(
      `SELECT id_repositorio_recorda, id_repositorio_ged, orgao, projeto,
              etapa_atual, status_atual, armario_codigo,
              seadesk_confirmado_em, seadesk_confirmado_por
       FROM repositorios
       WHERE ${where}
       ORDER BY id_repositorio_ged ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    return { itens: result.rows, total };
  }

  async create(data: {
    idRepositorioGed: string;
    orgao: string;
    projeto: string;
    armarioCodigo?: string;
  }): Promise<RepositorioRow> {
    const result = await this.db.query<RepositorioRow>(
      `INSERT INTO repositorios (id_repositorio_ged, orgao, projeto, armario_codigo, status_atual, etapa_atual)
       VALUES ($1, $2, $3, $4, 'RECEBIDO', 'RECEBIMENTO')
       RETURNING id_repositorio_recorda, id_repositorio_ged, orgao, projeto,
                 etapa_atual, status_atual, armario_codigo`,
      [data.idRepositorioGed, data.orgao, data.projeto, data.armarioCodigo ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new Error('Falha ao criar repositório');
    return row;
  }

  async updateEtapa(
    id: string,
    etapa: EtapaFluxo,
    status: StatusRepositorio
  ): Promise<RepositorioRow | null> {
    const result = await this.db.query<RepositorioRow>(
      `UPDATE repositorios
       SET etapa_atual = $2, status_atual = $3
       WHERE id_repositorio_recorda = $1
       RETURNING id_repositorio_recorda, id_repositorio_ged, orgao, projeto,
                 etapa_atual, status_atual, armario_codigo`,
      [id, etapa, status]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM repositorios WHERE id_repositorio_recorda = $1`,
      [id]
    );
    return result.rowCount > 0;
  }

  async confirmSeadesk(id: string, userId: string): Promise<RepositorioRow | null> {
    const result = await this.db.query<RepositorioRow>(
      `UPDATE repositorios
       SET seadesk_confirmado_em = CURRENT_TIMESTAMP,
           seadesk_confirmado_por = $2
       WHERE id_repositorio_recorda = $1
       RETURNING id_repositorio_recorda, seadesk_confirmado_em, seadesk_confirmado_por`,
      [id, userId]
    );
    return result.rows[0] ?? null;
  }
}
