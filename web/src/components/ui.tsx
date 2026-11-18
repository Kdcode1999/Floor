import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { initials } from "@/lib/initials";

/** The glass card. `role="status"` makes a screen reader say what is in it when it appears. */
export function Card({ children, className = "", role }: { children: ReactNode; className?: string; role?: "status" }) {
  return (
    <section className={`card ${className}`} role={role}>
      {children}
    </section>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "primary" is the one main action in a card. "ghost" is the quieter choice. */
  kind?: "primary" | "ghost";
  /** Shows "One moment" and ignores presses while the action is under way. */
  busy?: boolean;
}

export function Button({ kind = "primary", busy = false, disabled, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={`btn btn-${kind}`} disabled={disabled || busy} aria-busy={busy}>
      {busy ? "One moment…" : children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown under the field when something went wrong. */
  error?: string | null;
  /** A quiet line of help under the field. Gives way to the error. */
  hint?: string;
  /** Large, centred, widely spaced digits, for typing a code. */
  code?: boolean;
}

/** A labelled box to type in. */
export function Field({ label, error, hint, code = false, id, ...input }: FieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="field">
      <label className="label" htmlFor={fieldId}>
        {label}
      </label>
      <input {...input} id={fieldId} className={`input ${code ? "input-code" : ""}`} aria-invalid={error ? true : undefined} />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="small">{hint}</p>
      ) : null}
    </div>
  );
}

/** A space's logo in a circle, or its initials until it has one. */
export function Avatar({ name, image }: { name: string; image?: string | null }) {
  if (image) {
    // A plain img: the logo is a small file from Floor's own store, already the right size.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={image} alt="" />;
  }
  return (
    <div className="avatar" aria-hidden="true">
      {initials(name)}
    </div>
  );
}
