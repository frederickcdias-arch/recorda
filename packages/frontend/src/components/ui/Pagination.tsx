import { Button } from './Button';

interface PaginationProps {
  pagina: number;
  totalPaginas: number;
  onChange: (pagina: number) => void;
  disabled?: boolean;
}

export function Pagination({ pagina, totalPaginas, onChange, disabled }: PaginationProps): JSX.Element | null {
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-gray-500">
        Página {pagina} de {totalPaginas}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pagina === 1 || disabled}
          onClick={() => onChange(pagina - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pagina === totalPaginas || disabled}
          onClick={() => onChange(pagina + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
