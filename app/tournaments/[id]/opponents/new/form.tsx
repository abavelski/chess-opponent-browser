"use client";

import { useActionState } from "react";

import {
  addOpponentAction,
  type AddOpponentState,
} from "./actions";

type AddOpponentFormProps = {
  tournamentId: number;
};

const initialAddOpponentState: AddOpponentState = {
  values: { name: "", fideId: "", federation: "", rating: "" },
};

export function AddOpponentForm({ tournamentId }: AddOpponentFormProps) {
  const [state, formAction, pending] = useActionState(
    addOpponentAction,
    initialAddOpponentState,
  );

  return (
    <form action={formAction} className="stack-form">
      <input name="tournamentId" type="hidden" value={tournamentId} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field-group">
        <label htmlFor="name">Player name</label>
        <input
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          defaultValue={state.values.name}
          id="name"
          maxLength={200}
          name="name"
          required
        />
        {state.fieldErrors?.name ? (
          <p className="form-error" id="name-error">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="form-grid">
        <div className="field-group">
          <label htmlFor="fideId">FIDE ID</label>
          <input
            aria-describedby="fide-help"
            defaultValue={state.values.fideId}
            id="fideId"
            inputMode="numeric"
            maxLength={32}
            name="fideId"
          />
          <p className="helper-text" id="fide-help">
            Optional. Exact matches safely reuse an existing player.
          </p>
          {state.fieldErrors?.fideId ? (
            <p className="form-error">{state.fieldErrors.fideId}</p>
          ) : null}
        </div>

        <div className="field-group">
          <label htmlFor="federation">Federation</label>
          <input
            autoCapitalize="characters"
            defaultValue={state.values.federation}
            id="federation"
            maxLength={3}
            name="federation"
            placeholder="POL"
          />
          {state.fieldErrors?.federation ? (
            <p className="form-error">{state.fieldErrors.federation}</p>
          ) : null}
        </div>

        <div className="field-group">
          <label htmlFor="rating">Rating</label>
          <input
            defaultValue={state.values.rating}
            id="rating"
            inputMode="numeric"
            max="4000"
            min="1"
            name="rating"
            type="number"
          />
          {state.fieldErrors?.rating ? (
            <p className="form-error">{state.fieldErrors.rating}</p>
          ) : null}
        </div>
      </div>

      <div className="form-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Adding…" : "Add opponent"}
        </button>
      </div>
    </form>
  );
}
