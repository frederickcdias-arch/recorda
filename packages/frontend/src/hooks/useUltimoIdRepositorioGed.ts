import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

/**
 * Busca o ultimo id_repositorio_ged criado para uma unidade e projeto.
 */
export function useUltimoIdRepositorioGed(orgao: string, projeto: string) {
  return useQuery({
    queryKey: ['ultimo-id-repositorio-ged', orgao, projeto],
    enabled: !!orgao && !!projeto,
    queryFn: async () => {
      if (!orgao || !projeto) return null;
      const res = await api.get<{ itens: Array<{ id_repositorio_ged: string }> }>(
        `/operacional/repositorios?orgao=${encodeURIComponent(orgao)}&projeto=${encodeURIComponent(projeto)}&limite=1&pagina=1`
      );
      return res.itens?.[0]?.id_repositorio_ged || null;
    },
    staleTime: 10_000,
  });
}
