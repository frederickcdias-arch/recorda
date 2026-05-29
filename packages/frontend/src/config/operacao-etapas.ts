import type { EtapaFluxo, StatusRepositorio } from '@recorda/shared';

export type EtapaSlug =
  | 'recebimento'
  | 'preparacao'
  | 'digitalizacao'
  | 'conferencia'
  | 'reconferencia'
  | 'controle-qualidade';

export interface OperacaoEtapaConfig {
  slug: EtapaSlug;
  label: string;
  shortLabel: string;
  etapaApi: EtapaFluxo;
  path: string;
  menuIcon: string;
  nextSlug?: EtapaSlug;
  nextPath?: string;
  nextEtapaApi?: EtapaFluxo;
  nextStatus?: StatusRepositorio;
  prevSlug?: EtapaSlug;
  prevEtapaApi?: EtapaFluxo;
  prevStatus?: StatusRepositorio;
}

/** Status ao entrar na etapa (mesmo mapa da importação legada, com CQ em AGUARDANDO_CQ_LOTE). */
const STATUS_NA_ETAPA: Record<EtapaFluxo, StatusRepositorio> = {
  RECEBIMENTO: 'RECEBIDO',
  PREPARACAO: 'EM_PREPARACAO',
  DIGITALIZACAO: 'EM_DIGITALIZACAO',
  DIGITALIZACAO_COLORIDA: 'EM_DIGITALIZACAO',
  CONFERENCIA: 'EM_CONFERENCIA',
  RECONFERENCIA: 'EM_CONFERENCIA',
  MONTAGEM: 'EM_MONTAGEM',
  ATENDIMENTO: 'EM_ENTREGA',
  CONTROLE_QUALIDADE: 'AGUARDANDO_CQ_LOTE',
  ENTREGA: 'EM_ENTREGA',
};

const SLUG_DEFINITIONS: Array<{
  slug: EtapaSlug;
  label: string;
  shortLabel: string;
  etapaApi: EtapaFluxo;
  menuIcon: string;
}> = [
  {
    slug: 'recebimento',
    label: 'Recebimento',
    shortLabel: 'Receb.',
    etapaApi: 'RECEBIMENTO',
    menuIcon: 'inbox',
  },
  {
    slug: 'preparacao',
    label: 'Preparação',
    shortLabel: 'Prep.',
    etapaApi: 'PREPARACAO',
    menuIcon: 'layers',
  },
  {
    slug: 'digitalizacao',
    label: 'Digitalização',
    shortLabel: 'Digit.',
    etapaApi: 'DIGITALIZACAO',
    menuIcon: 'camera',
  },
  {
    slug: 'conferencia',
    label: 'Conferência',
    shortLabel: 'Conf.',
    etapaApi: 'CONFERENCIA',
    menuIcon: 'file',
  },
  {
    slug: 'reconferencia',
    label: 'Reconferência',
    shortLabel: 'Reconf.',
    etapaApi: 'RECONFERENCIA',
    menuIcon: 'check-circle',
  },
  {
    slug: 'controle-qualidade',
    label: 'Controle de Qualidade',
    shortLabel: 'CQ',
    etapaApi: 'CONTROLE_QUALIDADE',
    menuIcon: 'check-circle',
  },
];

export const OPERACAO_ETAPAS_ORDER: EtapaSlug[] = SLUG_DEFINITIONS.map((item) => item.slug);

function buildEtapaMap(): Record<EtapaSlug, OperacaoEtapaConfig> {
  const map = {} as Record<EtapaSlug, OperacaoEtapaConfig>;

  SLUG_DEFINITIONS.forEach((def, index) => {
    const prev = SLUG_DEFINITIONS[index - 1];
    const next = SLUG_DEFINITIONS[index + 1];

    map[def.slug] = {
      slug: def.slug,
      label: def.label,
      shortLabel: def.shortLabel,
      etapaApi: def.etapaApi,
      path: `/operacao/${def.slug}`,
      menuIcon: def.menuIcon,
      ...(prev
        ? {
            prevSlug: prev.slug,
            prevEtapaApi: prev.etapaApi,
            prevStatus: STATUS_NA_ETAPA[prev.etapaApi],
          }
        : {}),
      ...(next
        ? {
            nextSlug: next.slug,
            nextPath: `/operacao/${next.slug}`,
            nextEtapaApi: next.etapaApi,
            nextStatus: STATUS_NA_ETAPA[next.etapaApi],
          }
        : {}),
    };
  });

  return map;
}

export const OPERACAO_ETAPA_MAP = buildEtapaMap();

export function isOperacaoEtapaSlug(value: string | undefined): value is EtapaSlug {
  return Boolean(value && value in OPERACAO_ETAPA_MAP);
}

export function getOperacaoEtapaConfig(slug: string | undefined): OperacaoEtapaConfig | null {
  if (!isOperacaoEtapaSlug(slug)) return null;
  return OPERACAO_ETAPA_MAP[slug];
}
