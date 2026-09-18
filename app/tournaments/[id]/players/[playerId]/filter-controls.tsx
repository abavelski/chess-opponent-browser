"use client";

import type { GameFilterState } from "@/lib/games/filters";

type GameFilterControlsProps = {
  action: string;
  value: GameFilterState;
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
    <label className="compact-filter-field" htmlFor={id}>
      <span>{label}</span>
      <select defaultValue={value} id={id} key={`${name}:${value}`} name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GameFilterControls({
  action,
  value,
  showReset,
}: GameFilterControlsProps) {
  return (
    <form
      action={action}
      className="compact-game-filters"
      method="get"
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      <FilterSelect
        id="game-color-filter"
        label="Color"
        name="color"
        options={[
          { value: "all", label: "All" },
          { value: "white", label: "White" },
          { value: "black", label: "Black" },
        ]}
        value={value.color}
      />
      <FilterSelect
        id="game-date-filter"
        label="Date"
        name="date"
        options={[
          { value: "all", label: "All time" },
          { value: "6m", label: "6 months" },
          { value: "1y", label: "1 year" },
          { value: "2y", label: "2 years" },
          { value: "5y", label: "5 years" },
        ]}
        value={value.date}
      />
      <FilterSelect
        id="game-sort-filter"
        label="Sort"
        name="sort"
        options={[
          { value: "newest", label: "Newest" },
          { value: "oldest", label: "Oldest" },
          { value: "strongest", label: "Strongest" },
        ]}
        value={value.sort}
      />

      <noscript>
        <button className="button secondary-button compact-filter-submit" type="submit">
          Apply
        </button>
      </noscript>

      {showReset ? (
        <a className="text-link compact-filter-reset" href={action}>
          Reset
        </a>
      ) : null}
    </form>
  );
}
