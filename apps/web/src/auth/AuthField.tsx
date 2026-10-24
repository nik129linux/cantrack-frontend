import { useState, type ReactNode } from "react";
import { authCopy } from "./messages.js";
import { EyeIcon, EyeOffIcon } from "./icons.js";

type AuthFieldProps = {
  id: string;
  name: string;
  label: string;
  icon: ReactNode;
  type?: "text" | "email" | "tel" | "password";
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

/** Labelled input with a leading icon; password fields get a show/hide toggle. */
export function AuthField({
  id,
  name,
  label,
  icon,
  type = "text",
  autoComplete,
  value,
  onChange,
  onFocus,
  onBlur,
}: AuthFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className={isPassword ? "auth-input auth-input--password" : "auth-input"}>
        <span className="auth-input__icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          className="form-input auth-input__control"
          name={name}
          type={isPassword && isVisible ? "text" : type}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {isPassword ? (
          <button
            type="button"
            className="auth-input__toggle"
            aria-label={isVisible ? authCopy.fields.hidePassword : authCopy.fields.showPassword}
            aria-pressed={isVisible}
            onClick={() => setIsVisible((current) => !current)}
          >
            {isVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
