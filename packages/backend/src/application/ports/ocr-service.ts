export interface OCRResult {
  texto: string;
  confianca: number;
  idioma: string;
  tempoProcessamento: number;
}

export interface OCRService {
  extrairTexto(imagemBase64: string): Promise<OCRResult>;
  extrairTextoLote(imagensBase64: string[]): Promise<OCRResult[]>;
  validarImagem(imagemBase64: string): Promise<{ valida: boolean; erro?: string }>;
}
