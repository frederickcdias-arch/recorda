import type { DatabaseClient } from './repositorio-repository.js';

export interface ProducaoRow {
  id: string;
  repositorio_id: string;
  etapa: string;
  checklist_id: string | null;
  quantidade: number;
  usuario_id: string;
  data_producao: string;
  marcadores: Record<string, unknown>;
}

export class ProducaoRepository {
  constructor(private db: DatabaseClient) {}

  async list(opts?: {
    etapa?: string;
    repositorioId?: string;
    usuarioId?: string;
    dataInicio?: string;
    dataFim?: string;
    limite?: number;
    pagina?: number;
  }): Promise<{ itens: ProducaoRow[]; total: number }> {
    const limite = opts?.limite ?? 50;
    const pagina = opts?.pagina ?? 1;
    const offset = (pagina - 1) * limite;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.etapa) {
      conditions.push(`p.etapa = $${idx}`);
      params.push(opts.etapa);
      idx++;
    }
    if (opts?.repositorioId) {
      conditions.push(`p.repositorio_id = $${idx}`);
      params.push(opts.repositorioId);
      idx++;
    }
    if (opts?.usuarioId) {
      conditions.push(`p.usuario_id = $${idx}`);
      params.push(opts.usuarioId);
      idx++;
    }
    if (opts?.dataInicio) {
      conditions.push(`p.data_producao >= $${idx}`);
      params.push(opts.dataInicio);
      idx++;
    }
    if (opts?.dataFim) {
      conditions.push(`p.data_producao <= $${idx}`);
      params.push(opts.dataFim);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM producao_repositorio p WHERE ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    params.push(limite, offset);
    const result = await this.db.query<ProducaoRow>(
      `SELECT p.id, p.repositorio_id, p.etapa, p.checklist_id,
              p.quantidade, p.usuario_id, p.data_producao, p.marcadores
       FROM producao_repositorio p
       WHERE ${where}
       ORDER BY p.data_producao DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return { itens: result.rows, total };
  }

  async create(data: {
    repositorioId: string;
    etapa: string;
    checklistId?: string;
    quantidade: number;
    usuarioId: string;
    marcadores?: Record<string, unknown>;
  }): Promise<ProducaoRow> {
    const result = await this.db.query<ProducaoRow>(
      `INSERT INTO producao_repositorio (repositorio_id, etapa, checklist_id, quantidade, usuario_id, marcadores)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, repositorio_id, etapa, checklist_id, quantidade, usuario_id, data_producao, marcadores`,
      [
        data.repositorioId,
        data.etapa,
        data.checklistId ?? null,
        data.quantidade,
        data.usuarioId,
        JSON.stringify(data.marcadores ?? {}),
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error('Falha ao registrar produção');
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM producao_repositorio WHERE id = $1`, [id]);
    return result.rowCount > 0;
  }
}
