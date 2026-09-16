"use client";

import type { GameFilterState } from "@/lib/games/filters";

type SourceOption = {
  key: string;
  label: string;
};

type GameFilterControlsProps = {
  action: string;
  value: GameFilterState;
  sources: SourceOption[];
  showReset: boolean;
};

type FilterSelectProps = {
  id: string;
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
};

function FilterSelect({ id, label, name, value, options }: FilterSelectProps) {
  return (
    <div className="game-filter-field">
      <label htmlFor={id}>{label}</label>
      <select defaultValue={value} id={id} key={`${name}:${value}`} name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GameFilterControls({
  action,
  value,
  sources,
  showReset,
}: GameFilterControlsProps) {
  return (
    <form
      action={action}
      className="panel game-filter-panel"
      method="get"
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      <div className="game-filter-grid">
        <FilterSelect
          id="game-color-filter"
          label="Color"
          name="color"
          options={[
            { value: "all", label: "All" },
            { value: "white", label: "Opponent as White" },
            { value: "black", label: "Opponent as Black" },
          ]}
          value={value.color}
        />
        <FilterSelect
          id="game-date-filter"
          label="Date"
          name="date"
          options={[
            { value: "all", label: "All" },
            { value: "6m", label: "Last 6 months" },
            { value: "1y", label: "Last year" },
            { value: "2y", label: "Last 2 years" },
            { value: "5y", label: "Last 5 years" },
          ]}
          value={value.date}
        />
        <FilterSelect
          id="game-rating-filter"
          label="Opponent rating"
          name="rating"
          options={[
            { value: "all", label: "All" },
            { value: "1800", label: ">= 1800" },
            { value: "2000", label: ">= 2000" },
            { value: "2200", label: ">= 2200" },
          ]}
          value={value.rating}
        />
        <FilterSelect
          id="game-result-filter"
          label="Result"
          name="result"
          options={[
            { value: "all", label: "All" },
            { value: "win", label: "Win" },
            { value: "draw", label: "Draw" },
            { value: "loss", label: "Loss" },
          ]}
          value={value.result}
        />
        <FilterSelect
          id="game-source-filter"
          label="Source"
          name="source"
          options={[
            { value: "all", label: "All" },
            ...sources.map((source) => ({ value: source.key, label: source.label })),
          ]}
          value={value.source}
        />
        <FilterSelect
          id="game-sort-filter"
          label="Sort"
          name="sort"
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "strongest", label: "Strongest opponent first" },
          ]}
          value={value.sort}
        />
      </div>

      <div className="game-filter-actions">
        <noscript>
          <button className="button secondary-button" type="submit">
            Apply filters
          </button>
        </noscript>
        {showReset ? (
          <a className="text-link" href={action}>
            Reset filters
          </a>
        ) : null}
      </div>
    </form>
  );
}
