import { describe, expect, it } from 'vitest';
import { buildComunicadoPushNotification } from './web-push-service.js';

describe('buildComunicadoPushNotification', () => {
  it('usa titulo institucional por categoria e corpo curto a partir do resumo', () => {
    const payload = buildComunicadoPushNotification({
      comunicadoId: 'com-1',
      titulo: 'Comunidade - Salário de Maio 2026',
      conteudo:
        'Conforme informado pelo administrativo da empresa, o pagamento ocorrerá na sexta-feira com detalhes no sistema.',
      prioridade: 'MEDIA',
      categoria: 'ADMINISTRATIVO',
      resumo: 'Salário de maio/2026 previsto para sexta-feira, 05/06.',
      usuarioIds: ['user-1'],
    });

    expect(payload.title).toBe('Recorda | Administrativo');
    expect(payload.body).toBe(
      'Salário de maio/2026 previsto para sexta-feira, 05/06. Toque para ver os detalhes.'
    );
    expect(payload.body.length).toBeLessThanOrEqual(110);
    expect(payload.url).toBe('/comunicados');
  });

  it('faz fallback para atenção quando não há categoria e a prioridade é alta', () => {
    const payload = buildComunicadoPushNotification({
      comunicadoId: 'com-2',
      titulo: 'Manutenção emergencial',
      conteudo: 'O sistema ficará indisponível por alguns minutos para ajuste corretivo.',
      prioridade: 'ALTA',
      categoria: 'GERAL',
      resumo: null,
      usuarioIds: ['user-1'],
    });

    expect(payload.title).toBe('Recorda | Atenção');
    expect(payload.body).toBe('Manutenção emergencial. Toque para ver os detalhes.');
  });

  it('remove menções de marca do corpo e limita o tamanho final', () => {
    const payload = buildComunicadoPushNotification({
      comunicadoId: 'com-3',
      titulo: 'Recorda - Atualização operacional importante para a equipe de conferência',
      conteudo:
        'Recorda informa que a rotina de conferência terá ajuste no procedimento a partir de amanhã, com detalhamento completo no comunicado interno.',
      prioridade: 'MEDIA',
      categoria: null,
      resumo: null,
      usuarioIds: ['user-1'],
    });

    expect(payload.title).toBe('Recorda | Comunicado');
    expect(payload.body).not.toMatch(/recorda/i);
    expect(payload.body.length).toBeLessThanOrEqual(110);
  });
});
