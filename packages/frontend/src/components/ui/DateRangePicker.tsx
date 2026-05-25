import { Button } from './Button';
import { Input } from './Input';

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

type PresetKey = 'today' | '7days' | 'thisMonth' | 'lastMonth';

interface Preset {
  key: PresetKey;
  label: string;
  range: () => { startDate: string; endDate: string };
}

const PRESETS: Preset[] = [
  {
    key: 'today',
    label: 'Hoje',
    range: () => {
      const today = toISODate(new Date());
      return { startDate: today, endDate: today };
    },
  },
  {
    key: '7days',
    label: '7 dias',
    range: () => ({
      startDate: toISODate(addDays(new Date(), -6)),
      endDate: toISODate(new Date()),
    }),
  },
  {
    key: 'thisMonth',
    label: 'Este mês',
    range: () => ({
      startDate: toISODate(firstDayOfMonth(new Date())),
      endDate: toISODate(new Date()),
    }),
  },
  {
    key: 'lastMonth',
    label: 'Mês passado',
    range: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        startDate: toISODate(firstDayOfMonth(first)),
        endDate: toISODate(lastDayOfMonth(first)),
      };
    },
  },
];

interface PresetRange {
  startDate: string;
  endDate: string;
  preset: string;
}

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
  disabled?: boolean;
  className?: string;
  showPresets?: boolean;
  onPresetChange?: (range: PresetRange) => void;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = 'Data início',
  endLabel = 'Data fim',
  disabled = false,
  className,
  showPresets = false,
  onPresetChange,
}: DateRangePickerProps): JSX.Element {
  function handlePreset(preset: Preset): void {
    const range = preset.range();
    onStartDateChange(range.startDate);
    onEndDateChange(range.endDate);
    onPresetChange?.({ ...range, preset: preset.key });
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Input
          type="date"
          label={startLabel}
          value={startDate}
          max={endDate || undefined}
          disabled={disabled}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
        <Input
          type="date"
          label={endLabel}
          value={endDate}
          min={startDate || undefined}
          disabled={disabled}
          onChange={(event) => onEndDateChange(event.target.value)}
        />
      </div>

      {showPresets ? (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => handlePreset(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
