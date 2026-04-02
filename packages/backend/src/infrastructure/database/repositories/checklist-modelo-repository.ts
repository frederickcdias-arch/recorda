import type { DatabaseClient } from './repositorio-repository.js';

export interface ChecklistModeloRow {
  id: string;
  codigo: string;
  descricao: string;
  obrigatorio: boolean;
  etapa: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export class ChecklistModeloRepository {
  constructor(private db: DatabaseClient) {}

  async list(etapa?: string): Promise<ChecklistModeloRow[]> {
    if (etapa) {
      const result = await this.db.query<ChecklistModeloRow>(
        `SELECT id, codigo, descricao, obrigatorio, etapa, ordem, ativo, criado_em
         FROM checklist_modelos
         WHERE etapa = $1
         ORDER BY ordem, codigo`,
        [etapa]
      );
      return result.rows;
    }
    const result = await this.db.query<ChecklistModeloRow>(
      `SELECT id, codigo, descricao, obrigatorio, etapa, ordem, ativo, criado_em
       FROM checklist_modelos
       ORDER BY etapa, ordem, codigo`
    );
    return result.rows;
  }

  async findById(id: string): Promise<ChecklistModeloRow | null> {
    const result = await this.db.query<ChecklistModeloRow>(
      `SELECT id, codigo, descricao, obrigatorio, etapa, ordem, ativo, criado_em
       FROM checklist_modelos WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async create(data: {
    codigo: string;
    descricao: string;
    obrigatorio?: boolean;
    etapa: string;
    ordem?: number;
  }): Promise<ChecklistModeloRow> {
    const result = await this.db.query<ChecklistModeloRow>(
      `INSERT INTO checklist_modelos (codigo, descricao, obrigatorio, etapa, ordem)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, codigo, descricao, obrigatorio, etapa, ordem, ativo, criado_em`,
      [data.codigo, data.descricao, data.obrigatorio ?? true, data.etapa, data.ordem ?? 0]
    );
    const row = result.rows[0];
    if (!row) throw new Error('Falha ao criar modelo de checklist');
    return row;
  }

  async update(
    id: string,
    data: {
      codigo?: string;
      descricao?: string;
      obrigatorio?: boolean;
      etapa?: string;
      ordem?: number;
      ativo?: boolean;
    }
  ): Promise<ChecklistModeloRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.codigo !== undefined) {
      sets.push(`codigo = $${idx}`);
      params.push(data.codigo);
      idx++;
    }
    if (data.descricao !== undefined) {
      sets.push(`descricao = $${idx}`);
      params.push(data.descricao);
      idx++;
    }
    if (data.obrigatorio !== undefined) {
      sets.push(`obrigatorio = $${idx}`);
      params.push(data.obrigatorio);
      idx++;
    }
    if (data.etapa !== undefined) {
      sets.push(`etapa = $${idx}`);
      params.push(data.etapa);
      idx++;
    }
    if (data.ordem !== undefined) {
      sets.push(`ordem = $${idx}`);
      params.push(data.ordem);
      idx++;
    }
    if (data.ativo !== undefined) {
      sets.push(`ativo = $${idx}`);
      params.push(data.ativo);
      idx++;
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const result = await this.db.query<ChecklistModeloRow>(
      `UPDATE checklist_modelos SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, codigo, descricao, obrigatorio, etapa, ordem, ativo, criado_em`,
      params
    );
    return result.rows[0] ?? null;
  }

  async toggleAtivo(id: string): Promise<ChecklistModeloRow | null> {
    const result = await this.db.query<ChecklistModeloRow>(
      `UPDATE checklist_modelos SET ativo = NOT ativo WHERE id = $1
       RETURNING id, codigo, descricao, obrigatorio, etapa, ordem, ativo, criado_em`,
      [id]
    );
    return result.rows[0] ?? null;
  }
}
