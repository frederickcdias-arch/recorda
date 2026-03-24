import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import path from 'path';

export interface EmpresaConfig {
  nome?: string;
  logoUrl?: string;
  exibirLogoRelatorio?: boolean;
  logoLarguraRelatorio?: number;
  logoAlinhamentoRelatorio?: 'ESQUERDA' | 'CENTRO' | 'DIREITA' | string;
  logoDeslocamentoYRelatorio?: number;
}

interface EntregaLote {
  codigo: string;
  status: string;
  auditor_nome?: string | null;
  data_criacao?: string | null;
  data_fechamento?: string | null;
}

interface EntregaItem {
  ordem: number;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
  resultado: string;
  motivo_codigo?: string | null;
}

interface EntregaPayload {
  lote: EntregaLote;
  itens: EntregaItem[];
  totais: {
    total: number;
    aprovados: number;
    reprovados: number;
  };
  geradoEm: string;
}

interface RecebimentoPayload {
  projeto: string;
  responsavel: string;
  dataConclusao?: string | null;
  processos: Array<{
    repositorio: string;
    orgao: string;
    protocolo: string;
    interessado: string;
    setor: string;
    classificacao: string;
    volume: string;
    numeroCaixas: number;
    caixaNova: boolean;
    isApenso?: boolean;
    obs: string;
  }>;
  geradoEm: string;
}

interface ProducaoPayload {
  repositorio: {
    id_repositorio_recorda: string;
    id_repositorio_ged: string;
    orgao: string;
    projeto: string;
    status_atual: string;
    etapa_atual: string;
    armario_codigo?: string | null;
  };
  registros: Array<{
    etapa: string;
    usuario_nome?: string | null;
    quantidade: number;
    marcadores?: Record<string, unknown>;
    data_producao?: string | null;
    checklist_id: string;
  }>;
  totais: {
    totalRegistros: number;
    totalQuantidade: number;
  };
  geradoEm: string;
}

interface CorrecaoPayload {
  repositorio: {
    id_repositorio_ged: string;
    orgao: string;
    projeto: string;
  };
  documentos: Array<{
    protocolo: string;
    interessado: string;
    volume: string;
    observacao: string | null;
    avaliador_nome: string | null;
  }>;
  geradoEm: string;
}

interface DevolucaoPayload {
  projeto: string;
  responsavel: string;
  processos: Array<{
    repositorio: string;
    orgao: string;
    protocolo: string;
    interessado: string;
    setor: string;
    classificacao: string;
    volume: string;
    numeroCaixas: number;
    caixaNova: boolean;
    isApenso?: boolean;
    obs: string;
  }>;
  geradoEm: string;
}

const PDF_PAGE_SIZE = 'A4';

export class OperacionalPDFService {
  async gerarRelatorioEntrega(payload: EntregaPayload, empresa?: EmpresaConfig | null): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 34, size: PDF_PAGE_SIZE });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const marginLeft = doc.page.margins.left;

        // Espaço reservado para logo (4x10cm centralizado)
        await this.renderLogoSpace(doc, empresa);

        // Linha decorativa superior
        doc.save();
        doc.rect(marginLeft, doc.y, pageWidth, 3).fill('#1e3a5f');
        doc.restore();
        doc.moveDown(0.6);

        // Titulo
        doc.font('Helvetica-Bold').fontSize(15).fillColor('#1e3a5f')
          .text('TERMO DE ENTREGA', { align: 'center' });
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
          .text('Controle de Qualidade', { align: 'center' });
        doc.moveDown(0.4);

        // Linha fina separadora
        doc.save();
        doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + pageWidth, doc.y)
          .strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.restore();
        doc.moveDown(0.6);

        // Bloco de referencia
        const refBoxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, refBoxY, pageWidth, 52, 4).fill('#f8fafc');
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#6b7280');
        doc.text('LOTE', marginLeft + 12, refBoxY + 8);
        doc.text('STATUS', marginLeft + 160, refBoxY + 8);
        doc.text('AUDITOR', marginLeft + 300, refBoxY + 8);

        doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
        doc.text(payload.lote.codigo, marginLeft + 12, refBoxY + 20);
        doc.text(payload.lote.status, marginLeft + 160, refBoxY + 20);
        doc.text(payload.lote.auditor_nome ?? '-', marginLeft + 300, refBoxY + 20);

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#6b7280');
        doc.text('DATA CRIA\u00C7\u00C3O', marginLeft + 12, refBoxY + 34);
        doc.text('DATA FECHAMENTO', marginLeft + 160, refBoxY + 34);

        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        doc.text(this.formatDateTime(payload.lote.data_criacao), marginLeft + 12, refBoxY + 44);
        doc.text(this.formatDateTime(payload.lote.data_fechamento), marginLeft + 160, refBoxY + 44);

        doc.y = refBoxY + 60;
        doc.moveDown(0.5);

        // Texto formal
        const auditor = payload.lote.auditor_nome || 'o auditor respons\u00E1vel';
        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.text(
          `Pelo presente termo, declaramos que ${auditor} realizou a auditoria de controle de qualidade do lote ${payload.lote.codigo}, conforme itens discriminados na tabela abaixo:`,
          marginLeft, doc.y, { width: pageWidth, align: 'justify', lineGap: 3 }
        );
        doc.moveDown(0.6);

        // Resumo (box)
        const boxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, boxY, pageWidth, 32, 4).fill('#eef2ff');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a5f');
        doc.text(`Total: ${payload.totais.total}`, marginLeft + 12, boxY + 10);
        doc.text(`Aprovados: ${payload.totais.aprovados}`, marginLeft + 140, boxY + 10);
        doc.text(`Reprovados: ${payload.totais.reprovados}`, marginLeft + 300, boxY + 10);
        doc.y = boxY + 40;

        // Tabela
        this.renderGenericTable(
          doc,
          ['#', 'ID GED', 'UNIDADE', 'PROJETO', 'RESULTADO', 'MOTIVO'],
          [32, 110, 120, 120, 68, 60],
          payload.itens.map((item) => [
            String(item.ordem),
            item.id_repositorio_ged,
            item.orgao,
            item.projeto,
            item.resultado,
            item.motivo_codigo ?? '-',
          ])
        );

        // Data e assinaturas
        this.renderDataAssinaturas(doc, payload.geradoEm, 'Auditor / Controle de Qualidade', 'Respons\u00E1vel pela Entrega');

        this.renderRodape(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async gerarRelatorioRecebimento(payload: RecebimentoPayload, empresa?: EmpresaConfig | null): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // Margem menor para melhor aproveitamento do A4
        const doc = new PDFDocument({ margin: 24, size: PDF_PAGE_SIZE });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const marginLeft = doc.page.margins.left;
        const colPad = 8;
        const processos = payload.processos ?? [];

        // Espaço reservado para logo (4x10cm centralizado)
        await this.renderLogoSpace(doc, empresa);

        // Linha decorativa superior
        doc.save();
        doc.rect(marginLeft, doc.y, pageWidth, 3).fill('#1e3a5f');
        doc.restore();
        doc.moveDown(0.4);

        // Titulo
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1e3a5f')
          .text('TERMO DE RECEBIMENTO DE DOCUMENTOS', { align: 'center' });
        doc.font('Helvetica').fontSize(10).fillColor('#6b7280')
          .text('Controle Operacional', { align: 'center' });
        doc.moveDown(0.3);

        // Linha fina separadora
        doc.save();
        doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + pageWidth, doc.y)
          .strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.restore();
        doc.moveDown(0.4);

        // Bloco de referencia
        const setores = [...new Set(processos.map((p) => (p.setor ?? '').trim()).filter(Boolean))];
        const setorTexto = setores.length > 0 ? setores.join(', ') : 'NAO INFORMADO';

        const refBoxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, refBoxY, pageWidth, 36, 4).fill('#f8fafc');
        doc.restore();

        // Distribuição proporcional das colunas
        const col1 = marginLeft + 12;
        const col2 = marginLeft + Math.floor(pageWidth * 0.38);
        const col3 = marginLeft + Math.floor(pageWidth * 0.68);

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#6b7280');
        doc.text('SETOR', col1, refBoxY + 8);
        doc.text('PROJETO', col2, refBoxY + 8);
        doc.text('RESPONSÁVEL', col3, refBoxY + 8);

        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.text(setorTexto, col1, refBoxY + 20, { width: col2 - col1 - colPad, lineBreak: true });
        doc.text(payload.projeto, col2, refBoxY + 20, { width: col3 - col2 - colPad, ellipsis: true });
        doc.text(payload.responsavel, col3, refBoxY + 20, { width: pageWidth - (col3 - marginLeft) - 12, ellipsis: true });

        doc.y = refBoxY + 46;
        doc.moveDown(0.2);

        // Texto formal
        const setorFormal = setores.length > 0 ? setores.join(', ') : 'setor de origem';
        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.text(
          `Pelo presente termo, declaramos que recebemos do(a) ${setorFormal} os processos e documentos abaixo discriminados, para fins de tratamento documental.`,
          marginLeft, doc.y, { width: pageWidth, align: 'justify', lineGap: 2 }
        );
        doc.moveDown(0.4);

        // Resumo (box)
        const repos = [...new Set(processos.map((p) => p.repositorio).filter(Boolean))];
        const mainProcessos = processos.filter((p) => !p.isApenso);
        const totalApensos = processos.filter((p) => p.isApenso).length;
        const boxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, boxY, pageWidth, 28, 4).fill('#eef2ff');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a5f');
        const totalImagens = processos.length;
        const totalCaixas = processos
          .filter((p) => !p.isApenso)
          .reduce((acc, p) => acc + Math.max(Number(p.numeroCaixas ?? 0), 0), 0);
        // Resumo mais distribuído
        doc.text(`Imagens: ${totalImagens}`, marginLeft + 12, boxY + 8);
        doc.text(totalApensos > 0 ? `(${mainProcessos.length} processos + ${totalApensos} apensos)` : `Repositórios: ${repos.length}`, marginLeft + Math.floor(pageWidth / 2.5), boxY + 8);
        doc.text(`Caixas: ${totalCaixas}`, marginLeft + Math.floor(pageWidth * 0.75), boxY + 8);

        // Tabela de processos (com apensos intercalados)
        if (processos.length > 0) {
          // Colunas mais largas e proporcionais para melhor uso do A4
          const tableRows = processos.map((item, idx) => [
            String(idx + 1),
            item.repositorio,
            item.orgao,
            item.setor || '-',
            item.protocolo,
            item.interessado,
            item.classificacao || '-',
            item.volume,
            item.obs || '',
          ]);

          // Larguras proporcionais (soma ~100% do pageWidth)
          const colWidths = [
            22, // #
            Math.floor(pageWidth * 0.12), // REPOSITORIO
            Math.floor(pageWidth * 0.12), // UNIDADE
            Math.floor(pageWidth * 0.10), // SETOR
            Math.floor(pageWidth * 0.10), // PROTOCOLO
            Math.floor(pageWidth * 0.15), // INTERESSADO
            Math.floor(pageWidth * 0.14), // CLASSIF. (aumentado)
            Math.floor(pageWidth * 0.08), // VOL.
            Math.floor(pageWidth * 0.14), // OBS
          ];

          this.renderRecebimentoTable(
            doc,
            ['#', 'REPOSITORIO', 'UNIDADE', 'SETOR', 'PROTOCOLO', 'INTERESSADO', 'CLASSIF.', 'VOL.', 'OBS'],
            colWidths,
            tableRows,
            processos.map((p) => !!p.isApenso),
          );
        } else {
          doc.font('Helvetica-Oblique').fontSize(10).fillColor('#6b7280');
          doc.text('Nenhum processo registrado para este recebimento.', { align: 'center' });
          doc.moveDown(1);
        }

        // Data e assinaturas
        this.renderDataAssinaturas(doc, payload.geradoEm, 'Equipe de Recebimento', 'Setor Remetente');

        this.renderRodape(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async gerarTermoCorrecao(payload: CorrecaoPayload, empresa?: EmpresaConfig | null): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 34, size: PDF_PAGE_SIZE });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const marginLeft = doc.page.margins.left;

        // Espaço reservado para logo (4x10cm centralizado)
        await this.renderLogoSpace(doc, empresa);

        // Decorative bar
        doc.save();
        doc.rect(marginLeft, doc.y, pageWidth, 3).fill('#b91c1c');
        doc.restore();
        doc.moveDown(0.6);

        // Title
        doc.font('Helvetica-Bold').fontSize(15).fillColor('#b91c1c')
          .text('TERMO DE CORRE\u00C7\u00C3O', { align: 'center' });
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
          .text('Controle de Qualidade', { align: 'center' });
        doc.moveDown(0.4);

        // Separator
        doc.save();
        doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + pageWidth, doc.y)
          .strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.restore();
        doc.moveDown(0.6);

        // Reference box
        const refBoxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, refBoxY, pageWidth, 38, 4).fill('#fef2f2');
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#6b7280');
        doc.text('REPOSIT\u00D3RIO', marginLeft + 12, refBoxY + 8);
        doc.text('UNIDADE', marginLeft + 200, refBoxY + 8);
        doc.text('PROJETO', marginLeft + 360, refBoxY + 8);

        doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
        doc.text(payload.repositorio.id_repositorio_ged, marginLeft + 12, refBoxY + 20, { width: 180, ellipsis: true });
        doc.text(payload.repositorio.orgao, marginLeft + 200, refBoxY + 20, { width: 150, ellipsis: true });
        doc.text(payload.repositorio.projeto, marginLeft + 360, refBoxY + 20, { width: 130, ellipsis: true });

        doc.y = refBoxY + 46;
        doc.moveDown(0.3);

        // Formal text
        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.text(
          `Pelo presente termo, informamos que os documentos abaixo listados do reposit\u00F3rio ${payload.repositorio.id_repositorio_ged} foram reprovados na auditoria de controle de qualidade e necessitam de corre\u00E7\u00E3o conforme observa\u00E7\u00F5es indicadas.`,
          marginLeft, doc.y, { width: pageWidth, align: 'justify', lineGap: 3 }
        );
        doc.moveDown(0.6);

        // Summary box
        const boxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, boxY, pageWidth, 32, 4).fill('#fef2f2');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c');
        doc.text(`Documentos reprovados: ${payload.documentos.length}`, marginLeft + 12, boxY + 10);
        doc.y = boxY + 40;

        // Table
        this.renderGenericTable(
          doc,
          ['#', 'PROTOCOLO', 'INTERESSADO', 'VOL.', 'OBSERVA\u00C7\u00C3O'],
          [28, 100, 130, 36, 210],
          payload.documentos.map((item, idx) => [
            String(idx + 1),
            item.protocolo,
            item.interessado,
            item.volume ?? '1',
            item.observacao ?? '-',
          ])
        );

        // Date and signatures
        this.renderDataAssinaturas(doc, payload.geradoEm, 'Controle de Qualidade', 'Conferente Respons\u00E1vel');

        this.renderRodape(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async gerarTermoDevolucao(payload: DevolucaoPayload, empresa?: EmpresaConfig | null): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 34, size: PDF_PAGE_SIZE });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const marginLeft = doc.page.margins.left;
        const processos = payload.processos ?? [];

        // Espaço reservado para logo (4x10cm centralizado)
        await this.renderLogoSpace(doc, empresa);

        // Decorative bar
        doc.save();
        doc.rect(marginLeft, doc.y, pageWidth, 3).fill('#1e3a5f');
        doc.restore();
        doc.moveDown(0.6);

        // Title
        doc.font('Helvetica-Bold').fontSize(15).fillColor('#1e3a5f')
          .text('TERMO DE DEVOLU\u00C7\u00C3O DE DOCUMENTOS', { align: 'center' });
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
          .text('Controle de Qualidade', { align: 'center' });
        doc.moveDown(0.4);

        // Separator
        doc.save();
        doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + pageWidth, doc.y)
          .strokeColor('#d1d5db').lineWidth(0.5).stroke();
        doc.restore();
        doc.moveDown(0.6);

        // Reference box
        const setores = [...new Set(processos.map((p) => (p.setor ?? '').trim()).filter(Boolean))];
        const setorTexto = setores.length > 0 ? setores.join(', ') : 'NAO INFORMADO';

        const refBoxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, refBoxY, pageWidth, 38, 4).fill('#f8fafc');
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#6b7280');
        doc.text('SETOR DESTINAT\u00C1RIO', marginLeft + 12, refBoxY + 8);
        doc.text('PROJETO', marginLeft + 240, refBoxY + 8);

        doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
        doc.text(setorTexto, marginLeft + 12, refBoxY + 20, { width: 220, lineBreak: true });
        doc.text(payload.projeto, marginLeft + 240, refBoxY + 20, { width: 250, ellipsis: true });

        doc.y = refBoxY + 46;
        doc.moveDown(0.3);

        // Formal text
        const setorFormal = setores.length > 0 ? setores.join(', ') : 'setor de destino';
        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.text(
          `Pelo presente termo, declaramos que devolvemos ao(\u00E0) ${setorFormal} os processos e documentos abaixo discriminados, ap\u00F3s conclus\u00E3o do tratamento documental e aprova\u00E7\u00E3o no controle de qualidade.`,
          marginLeft, doc.y, { width: pageWidth, align: 'justify', lineGap: 3 }
        );
        doc.moveDown(0.6);

        // Summary box
        const repos = [...new Set(processos.map((p) => p.repositorio).filter(Boolean))];
        const boxY = doc.y;
        doc.save();
        doc.roundedRect(marginLeft, boxY, pageWidth, 32, 4).fill('#eef2ff');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a5f');
        const totalImagens = processos.length;
        const totalCaixas = processos
          .filter((p) => !p.isApenso)
          .reduce((acc, p) => acc + Math.max(Number(p.numeroCaixas ?? 0), 0), 0);
        doc.text(`Imagens: ${totalImagens}`, marginLeft + 12, boxY + 10);
        doc.text(`Repositórios: ${repos.length}`, marginLeft + 140, boxY + 10);
        doc.text(`Caixas: ${totalCaixas}`, marginLeft + 320, boxY + 10);

        // Table (same format as recebimento)
        if (processos.length > 0) {
          const tableRows = processos.map((item, idx) => [
            String(idx + 1),
            item.repositorio,
            item.orgao,
            item.setor || '-',
            item.protocolo,
            item.interessado,
            item.classificacao || '-',
            item.volume,
            item.obs || '',
          ]);

          this.renderRecebimentoTable(
            doc,
            ['#', 'REPOSITORIO', 'UNIDADE', 'SETOR', 'PROTOCOLO', 'INTERESSADO', 'CLASSIF.', 'VOL.', 'OBS'],
            [16, 68, 44, 58, 58, 72, 44, 34, 120],
            tableRows,
            processos.map((p) => !!p.isApenso),
          );
        }

        // Date and signatures
        this.renderDataAssinaturas(doc, payload.geradoEm, 'Equipe de Controle de Qualidade', 'Setor Destinat\u00E1rio');

        this.renderRodape(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async gerarRelatorioProducao(payload: ProducaoPayload, empresa?: EmpresaConfig | null): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 42, size: PDF_PAGE_SIZE });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Espaço reservado para logo (4x10cm centralizado)
        await this.renderLogoSpace(doc, empresa);

        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1f2937').text('RELATORIO DE PRODUCAO', { align: 'center' });
        doc.moveDown(0.8);

        doc.font('Helvetica').fontSize(10).fillColor('#374151');
        doc.text(`ID GED: ${payload.repositorio.id_repositorio_ged}`);
        doc.text(`Unidade: ${payload.repositorio.orgao}`);
        doc.text(`Projeto: ${payload.repositorio.projeto}`);
        doc.text(`Status/Etapa: ${payload.repositorio.status_atual} / ${payload.repositorio.etapa_atual}`);
        doc.text(`Registros: ${payload.totais.totalRegistros}`);
        doc.text(`Quantidade total: ${payload.totais.totalQuantidade}`);
        doc.text(`Gerado em: ${this.formatDateTime(payload.geradoEm)}`);
        doc.moveDown(0.8);

        this.renderGenericTable(
          doc,
          ['#', 'ETAPA', 'OPERADOR', 'QTD', 'CHECKLIST', 'DATA/HORA'],
          [32, 90, 150, 48, 120, 86],
          payload.registros.map((item, index) => [
            String(index + 1),
            item.etapa,
            item.usuario_nome ?? '-',
            String(item.quantidade),
            item.checklist_id,
            this.formatDateTime(item.data_producao),
          ])
        );

        this.renderRodape(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private renderRecebimentoTable(
    doc: PDFKit.PDFDocument,
    headers: string[],
    widths: number[],
    rows: string[][],
    isApensoFlags: boolean[],
  ): void {
    const startX = doc.page.margins.left;
    const tableWidth = widths.reduce((a, b) => a + b, 0);
    let y = doc.y;
    const cellPadX = 2;
    const cellPadY = 2.5;
    const minRowH = 13;
    const noWrapCols = new Set([1, 7]); // REPOSITORIO e VOL.

    // Header row
    doc.save();
    doc.rect(startX, y, tableWidth, 18).fill('#dbeafe');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1f2937');
    let hx = startX;
    for (let i = 0; i < headers.length; i++) {
      const width = widths[i] ?? 60;
      doc.text(headers[i] ?? '', hx + cellPadX, y + 5, { width: width - cellPadX * 2, align: 'center' });
      hx += width;
    }
    y += 18;

    // Data rows with dynamic height
    rows.forEach((row, index) => {
      const isApenso = isApensoFlags[index] ?? false;
      const fontSize = isApenso ? 7 : 7.6;
      const font = isApenso ? 'Helvetica-Oblique' : 'Helvetica';

      // Measure max cell height for this row
      doc.font(font).fontSize(fontSize);
      let maxCellH = 0;
      for (let i = 0; i < widths.length; i++) {
        const width = widths[i] ?? 60;
        const cellW = width - cellPadX * 2;
        const text = row[i] ?? '';
        if (text) {
          const measureOpts = noWrapCols.has(i)
            ? { width: cellW, lineBreak: false }
            : { width: cellW };
          const h = doc.heightOfString(text, measureOpts);
          if (h > maxCellH) maxCellH = h;
        }
      }
      const rowH = Math.max(minRowH, maxCellH + cellPadY * 2);

      // Page break check
      if (y + rowH > doc.page.height - 70) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      // Background
      doc.save();
      if (isApenso) {
        doc.rect(startX, y, tableWidth, rowH).fill('#f0f4f8');
      } else if (index % 2 === 0) {
        doc.rect(startX, y, tableWidth, rowH).fill('#f9fafb');
      }
      doc.restore();

      // Text
      doc.font(font).fontSize(fontSize).fillColor(isApenso ? '#4b5563' : '#111827');
      let x = startX;
      for (let i = 0; i < widths.length; i++) {
        const width = widths[i] ?? 60;
        const textOpts = noWrapCols.has(i)
          ? { width: width - cellPadX * 2, lineBreak: false, ellipsis: true }
          : { width: width - cellPadX * 2 };
        doc.text(row[i] ?? '', x + cellPadX, y + cellPadY, {
          ...textOpts,
          align: 'center',
        });
        x += width;
      }
      y += rowH;
    });

    doc.y = y;
  }

  private renderGenericTable(
    doc: PDFKit.PDFDocument,
    headers: string[],
    widths: number[],
    rows: string[][]
  ): void {
    const startX = doc.page.margins.left;
    const tableWidth = widths.reduce((a, b) => a + b, 0);
    let y = doc.y;

    doc.save();
    doc.rect(startX, y, tableWidth, 22).fill('#dbeafe');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f2937');
    let hx = startX;
    for (let i = 0; i < headers.length; i++) {
      const width = widths[i] ?? 60;
      doc.text(headers[i] ?? '', hx + 4, y + 7, { width: width - 8 });
      hx += width;
    }
    y += 22;

    doc.font('Helvetica').fontSize(8.8).fillColor('#111827');
    rows.forEach((row, index) => {
      if (y > doc.page.height - 70) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      if (index % 2 === 0) {
        doc.save();
        doc.rect(startX, y, tableWidth, 20).fill('#f9fafb');
        doc.restore();
      }

      let x = startX;
      for (let i = 0; i < widths.length; i++) {
        const width = widths[i] ?? 60;
        doc.text(row[i] ?? '', x + 4, y + 6, { width: width - 8, ellipsis: true });
        x += width;
      }
      y += 20;
    });
  }

  private renderDataAssinaturas(
    doc: PDFKit.PDFDocument,
    dataRef: string,
    labelEsquerda: string,
    labelDireita: string
  ): void {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const marginLeft = doc.page.margins.left;

    // Garantir espaco minimo para data + assinaturas (~140px)
    const assinaturaHeight = 118;
    const limiteInferior = doc.page.height - doc.page.margins.bottom;
    if (doc.y + assinaturaHeight > limiteInferior) {
      doc.addPage();
    }

    doc.moveDown(1.5);

    // Data por extenso
    const data = new Date(dataRef);
    const dataValida = !Number.isNaN(data.getTime()) ? data : new Date();
    const dataFormatada = dataValida.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    doc.text(dataFormatada, marginLeft, doc.y, { width: pageWidth, align: 'left' });
    doc.moveDown(2.5);

    // Duas colunas de assinatura lado a lado
    const colWidth = (pageWidth - 40) / 2;
    const lineWidth = colWidth - 20;
    const leftX = marginLeft + 10;
    const rightX = marginLeft + colWidth + 30;
    const lineY = doc.y;

    // Linha esquerda
    doc.save();
    doc.moveTo(leftX, lineY).lineTo(leftX + lineWidth, lineY)
      .strokeColor('#374151').lineWidth(0.8).stroke();
    doc.restore();

    // Linha direita
    doc.save();
    doc.moveTo(rightX, lineY).lineTo(rightX + lineWidth, lineY)
      .strokeColor('#374151').lineWidth(0.8).stroke();
    doc.restore();

    // Labels
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
    doc.text(labelEsquerda, leftX, lineY + 6, { width: lineWidth, align: 'center' });
    doc.text(labelDireita, rightX, lineY + 6, { width: lineWidth, align: 'center' });
  }

  private renderRodape(doc: PDFKit.PDFDocument): void {
    doc.fontSize(8).fillColor('#6b7280');
    doc.text('Recorda - Relatorio operacional gerado automaticamente', 42, doc.page.height - 38, {
      align: 'center',
      width: doc.page.width - 84,
    });
  }

  private async renderLogoSpace(doc: PDFKit.PDFDocument, empresa?: EmpresaConfig | null): Promise<void> {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const marginLeft = doc.page.margins.left;
    
    // Espaço reservado para logo: 4x10cm máximo (convertido para pontos: 1cm = 28.35pt)
    const logoSpaceWidth = 4 * 28.35; // ~113.4 pontos
    const maxLogoSpaceHeight = 10 * 28.35; // ~283.5 pontos
    
    // Centralizar o espaço na página
    const logoX = marginLeft + (pageWidth - logoSpaceWidth) / 2;
    const logoY = doc.y;
    
    let actualImageHeight = 0;
    
    if (empresa?.logoUrl && empresa.exibirLogoRelatorio !== false) {
      try {
        const logoBuffer = await this.loadLogoBuffer(empresa);
        if (logoBuffer) {
          const imageWidth = Math.min(logoSpaceWidth - 10, this.normalizeLogoWidth(empresa?.logoLarguraRelatorio));
          const imageX = logoX + (logoSpaceWidth - imageWidth) / 2;
          const imageY = logoY + 10;
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const img = (doc as any).openImage(logoBuffer);
          let imgHeight = maxLogoSpaceHeight - 20;
          if (img && img.width && img.height) {
            imgHeight = (imageWidth / img.width) * img.height;
            imgHeight = Math.min(imgHeight, maxLogoSpaceHeight - 20);
          }
          
          doc.image(logoBuffer, imageX, imageY, { width: imageWidth });
          actualImageHeight = imgHeight + 20; // altura da imagem + margens
        }
      } catch {
        // Se falhar, apenas reserva o espaço mínimo
        actualImageHeight = 60; // espaço mínimo de fallback
      }
    }
    
    // Usar altura real da imagem ou espaço mínimo
    const usedHeight = Math.max(actualImageHeight, 60); // mínimo 60 pontos
    
    // Posicionar o cursor após o espaço usado
    doc.y = logoY + usedHeight + 2;
    
    // Nome da empresa abaixo do espaço da logo (se existir)
    if (empresa?.nome) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#4B5563')
        .text(empresa.nome, marginLeft, logoY + usedHeight + 6, { width: pageWidth, align: 'center' });
      doc.y = logoY + usedHeight + 18;
    }
  }

  private async loadLogoBuffer(empresa?: EmpresaConfig | null): Promise<Buffer | null> {
    if (!empresa?.logoUrl || empresa.exibirLogoRelatorio === false) {
      return null;
    }

    try {
      // Tentar carregar de arquivo local primeiro
      const uploadsDir = path.resolve('uploads', 'logos');
      try {
        const files = await fs.readdir(uploadsDir);
        const logoFile = files.find(f => f.startsWith('logo_empresa'));
        if (logoFile) {
          return await fs.readFile(path.join(uploadsDir, logoFile));
        }
      } catch {
        // Diretório não existe, continuar para HTTP
      }

      // Tentar carregar de URL HTTP
      if (empresa.logoUrl.startsWith('http')) {
        const response = await fetch(empresa.logoUrl);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      return null;
    } catch {
      return null;
    }
  }

  private formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('pt-BR');
  }

  private normalizeLogoWidth(value?: number): number {
    return Math.min(Math.max(Number(value ?? 120), 60), 260);
  }
}


