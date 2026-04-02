import type { OCRService, OCRResult } from '../../application/ports/ocr-service.js';
import Tesseract from 'tesseract.js';
import { preprocessImageForOCR } from './ocr-image-preprocessor.js';

export class OCRServiceDefault implements OCRService {
  async extrairTexto(imagemBase64: string): Promise<OCRResult> {
    const inicio = Date.now();

    const validacao = await this.validarImagem(imagemBase64);
    if (!validacao.valida) {
      throw new Error(validacao.erro ?? 'Imagem inválida');
    }

    try {
      // Pre-process image: grayscale, normalize, sharpen
      const processedImage = await preprocessImageForOCR(imagemBase64);

      const result = await Tesseract.recognize(processedImage, 'por', {
        logger: () => {},
      });

      const tempoProcessamento = Date.now() - inicio;

      return {
        texto: result.data.text.trim(),
        confianca: result.data.confidence / 100, // Normaliza para 0-1
        idioma: 'pt-BR',
        tempoProcessamento,
      };
    } catch (error) {
      console.error('[OCR] Erro:', error);
      const tempoProcessamento = Date.now() - inicio;
      return {
        texto: '',
        confianca: 0,
        idioma: 'pt-BR',
        tempoProcessamento,
      };
    }
  }

  async extrairTextoLote(imagensBase64: string[]): Promise<OCRResult[]> {
    const resultados: OCRResult[] = [];

    for (const imagem of imagensBase64) {
      try {
        const resultado = await this.extrairTexto(imagem);
        resultados.push(resultado);
      } catch (error) {
        resultados.push({
          texto: '',
          confianca: 0,
          idioma: 'pt-BR',
          tempoProcessamento: 0,
        });
      }
    }

    return resultados;
  }

  async validarImagem(imagemBase64: string): Promise<{ valida: boolean; erro?: string }> {
    if (!imagemBase64 || imagemBase64.trim().length === 0) {
      return { valida: false, erro: 'Imagem vazia' };
    }

    const base64Regex = /^data:image\/(png|jpeg|jpg|webp);base64,/;
    if (!base64Regex.test(imagemBase64)) {
      const pureBase64Regex = /^[A-Za-z0-9+/]+=*$/;
      if (!pureBase64Regex.test(imagemBase64.substring(0, 100))) {
        return { valida: false, erro: 'Formato de imagem inválido' };
      }
    }

    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const tamanhoBytes = (base64Data.length * 3) / 4;
    const tamanhoMB = tamanhoBytes / (1024 * 1024);

    if (tamanhoMB > 10) {
      return { valida: false, erro: 'Imagem muito grande (máximo 10MB)' };
    }

    return { valida: true };
  }

  async terminate(): Promise<void> {
    // No persistent worker to terminate
  }
}
