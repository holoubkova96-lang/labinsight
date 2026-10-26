type Props = {
  label: string;
  value: string;
  options: { value: string; label: string; group?: string }[];
  onChange: (v: string) => void;
};

/** Jednoduchý výběr jedné hodnoty (nativní <select> kvůli přístupnosti a mobilu). */
export function Select({ label, value, options, onChange }: Props) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-2">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[16rem] rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
      >
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ) : (
            options
              .filter((o) => !o.group)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
          ),
        )}
      </select>
    </label>
  );
}
