import { memo, useEffect, useRef } from "react";
import type { JSX, ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * The control vocabulary (design D1): macOS-convention primitives styled
 * purely against the token set. No per-appearance logic — components and
 * their CSS read --mdr-* variables only. All controls are memoized so
 * store-driven parents re-render without re-rendering unchanged controls.
 */

interface QuietButtonProps {
  readonly onClick: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly quiet?: boolean;
}

/** Borderless toolbar/tab action. `quiet` renders the content as-is. */
export const QuietButton = memo(function QuietButton({
  onClick,
  title,
  children,
}: QuietButtonProps): JSX.Element {
  return (
    <button type="button" className="mdr-quiet-button" onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
});

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
}

export const SegmentedControl = memo(function SegmentedControl<
  T extends string = string,
>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div className="mdr-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="mdr-segmented-item"
          data-checked={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
});

interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
}

export const Switch = memo(function Switch({
  checked,
  onChange,
  label,
}: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="mdr-switch"
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="mdr-switch-knob" />
    </button>
  );
});

interface PullDownProps<T extends string> {
  readonly value: T;
  readonly options: readonly T[];
  readonly onChange: (value: T) => void;
  readonly label: string;
}

export const PullDown = memo(function PullDown<T extends string = string>({
  value,
  options,
  onChange,
  label,
}: PullDownProps<T>): JSX.Element {
  return (
    <select
      className="mdr-pulldown"
      value={value}
      aria-label={label}
      onChange={(event) => {
        const next = event.target.value;
        const match = options.find((option) => option === next);
        if (match !== undefined) {
          onChange(match);
        }
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
});

interface TextFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}

export const TextField = memo(function TextField({
  value,
  onChange,
  label,
}: TextFieldProps): JSX.Element {
  return (
    <input
      type="text"
      className="mdr-text-field"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  );
});

interface StepperProps {
  readonly value: number;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly onChange: (value: number) => void;
  readonly label: string;
}

function clampToBounds(value: number, min: number | undefined, max: number | undefined): number {
  let result = value;
  if (min !== undefined) {
    result = Math.max(min, result);
  }
  if (max !== undefined) {
    result = Math.min(max, result);
  }
  return result;
}

/** macOS-style stepper: value display plus real up/down buttons, clamped to bounds. */
export const Stepper = memo(function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: StepperProps): JSX.Element {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <span className="mdr-stepper">
      <span className="mdr-stepper-value">{value}</span>
      <span className="mdr-stepper-buttons">
        <button
          type="button"
          className="mdr-stepper-button"
          aria-label={`Increase ${label}`}
          disabled={atMax}
          onClick={() => onChange(clampToBounds(value + step, min, max))}
        >
          +
        </button>
        <button
          type="button"
          className="mdr-stepper-button"
          aria-label={`Decrease ${label}`}
          disabled={atMin}
          onClick={() => onChange(clampToBounds(value - step, min, max))}
        >
          −
        </button>
      </span>
    </span>
  );
});

interface ModalSheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * In-app settings window (design D6): centered floating panel over dimmed
 * content. Restores focus to the previously focused element on close.
 */
export function ModalSheet({ open, title, onClose, children }: ModalSheetProps): JSX.Element | null {
  const previouslyFocused = useRef<Element | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement;
    sheetRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const element = previouslyFocused.current;
      if (element instanceof HTMLElement) {
        element.focus();
      }
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }
  return (
    <div className="mdr-sheet-backdrop">
      <div
        ref={sheetRef}
        className="mdr-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="mdr-sheet-titlebar">
          <span className="mdr-sheet-title">{title}</span>
          <QuietButton onClick={onClose} title="Close">
            <CloseIcon />
          </QuietButton>
        </div>
        <div className="mdr-sheet-body">{children}</div>
      </div>
    </div>
  );
}
