import type { DatabaseClient } from './repositorio-repository.js';

export interface ColaboradorRow {
  id: string;
  nome: string;
  matricula: string;
  email: string | null;
  ativo: boolean;
  coordenadoria_id: string;
  coordenadoria_nome?: string;
  coordenadoria_sigla?: string;
  criado_em: string;
}

export class ColaboradorRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string): Promise<ColaboradorRow | null> {
    const result = await this.db.query<ColaboradorRow>(
      `SELECT c.id, c.nome, c.matricula, c.email, c.ativo, c.coordenadoria_id, c.criado_em,
              co.nome as coordenadoria_nome, co.sigla as coordenadoria_sigla
       FROM colaboradores c
       LEFT JOIN coordenadorias co ON co.id = c.coordenadoria_id
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByMatricula(matricula: string): Promise<ColaboradorRow | null> {
    const result = await this.db.query<ColaboradorRow>(
      `SELECT id, nome, matricula, email, ativo, coordenadoria_id, criado_em
       FROM colaboradores WHERE matricula = $1`,
      [matricula]
    );
    return result.rows[0] ?? null;
  }

  async list(opts?: {
    nome?: string;
    coordenadoriaId?: string;
    ativo?: boolean;
    limite?: number;
    pagina?: number;
  }): Promise<{ itens: ColaboradorRow[]; total: number }> {
    const limite = opts?.limite ?? 50;
    const pagina = opts?.pagina ?? 1;
    const offset = (pagina - 1) * limite;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.nome) {
      conditions.push(`c.nome ILIKE $${idx}`);
      params.push(`%${opts.nome}%`);
      idx++;
    }
    if (opts?.coordenadoriaId) {
      conditions.push(`c.coordenadoria_id = $${idx}`);
      params.push(opts.coordenadoriaId);
      idx++;
    }
    if (opts?.ativo !== undefined) {
      conditions.push(`c.ativo = $${idx}`);
      params.push(opts.ativo);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM colaboradores c WHERE ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    params.push(limite, offset);
    const result = await this.db.query<ColaboradorRow>(
      `SELECT c.id, c.nome, c.matricula, c.email, c.ativo, c.coordenadoria_id, c.criado_em,
              co.nome as coordenadoria_nome, co.sigla as coordenadoria_sigla
       FROM colaboradores c
       LEFT JOIN coordenadorias co ON co.id = c.coordenadoria_id
       WHERE ${where}
       ORDER BY c.nome
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return { itens: result.rows, total };
  }

  async create(data: {
    nome: string;
    matricula: string;
    email?: string;
    coordenadoriaId: string;
  }): Promise<ColaboradorRow> {
    const result = await this.db.query<ColaboradorRow>(
      `INSERT INTO colaboradores (nome, matricula, email, coordenadoria_id, ativo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nome, matricula, email, ativo, coordenadoria_id, criado_em`,
      [data.nome, data.matricula, data.email ?? null, data.coordenadoriaId]
    );
    const row = result.rows[0];
    if (!row) throw new Error('Falha ao criar colaborador');
    return row;
  }

  async update(
    id: string,
    data: {
      nome: string;
      matricula: string;
      email?: string;
      coordenadoriaId: string;
    }
  ): Promise<ColaboradorRow | null> {
    const result = await this.db.query<ColaboradorRow>(
      `UPDATE colaboradores SET nome = $1, matricula = $2, email = $3, coordenadoria_id = $4
       WHERE id = $5
       RETURNING id, nome, matricula, email, ativo, coordenadoria_id, criado_em`,
      [data.nome, data.matricula, data.email ?? null, data.coordenadoriaId, id]
    );
    return result.rows[0] ?? null;
  }

  async toggleAtivo(id: string): Promise<ColaboradorRow | null> {
    const result = await this.db.query<ColaboradorRow>(
      `UPDATE colaboradores SET ativo = NOT ativo WHERE id = $1
       RETURNING id, nome, matricula, email, ativo, coordenadoria_id, criado_em`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async existsMatricula(matricula: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM colaboradores WHERE matricula = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM colaboradores WHERE matricula = $1 LIMIT 1`;
    const params = excludeId ? [matricula, excludeId] : [matricula];
    const result = await this.db.query(query, params);
    return result.rowCount > 0;
  }
}
