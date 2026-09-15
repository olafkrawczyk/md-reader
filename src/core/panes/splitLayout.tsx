import { useEffect, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { splitFractions } from "./layoutState";

export interface SplitSlot {
  readonly id: string;
  readonly content: JSX.Element;
}

interface SplitLayoutProps {
  readonly slots: readonly SplitSlot[];
}

const MIN_FRACTION = 0.15;
const MAX_FRACTION = 0.85;

export function slotSignature(slots: readonly SplitSlot[]): string {
  return slots.map((slot) => slot.id).join("|");
}

function initialFractions(slots: readonly SplitSlot[]): readonly number[] {
  const cached = splitFractions.get(slotSignature(slots));
  if (cached && cached.length === slots.length - 1) {
    return cached;
  }
  const fresh: number[] = [];
  for (let i = 1; i < slots.length; i += 1) {
    fresh.push(i / slots.length);
  }
  return fresh;
}

function SplitLayout({ slots }: SplitLayoutProps): JSX.Element {
  const [fractions, setFractions] = useState<readonly number[]>(() =>
    initialFractions(slots),
  );
  const splitRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    function onMove(event: MouseEvent): void {
      const index = dragIndexRef.current;
      const split = splitRef.current;
      if (index === null || split === null) {
        return;
      }
      // Divider positions are ratios of the split container, so the
      // pointer must be translated out of viewport coordinates.
      const rect = split.getBoundingClientRect();
      if (rect.width === 0) {
        return;
      }
      const ratio = (event.clientX - rect.left) / rect.width;
      setFractions((current) => {
        const leftNeighbor = index > 0 ? current[index - 1] : undefined;
        const rightNeighbor = index < current.length ? current[index + 1] : undefined;
        const lo = leftNeighbor !== undefined ? leftNeighbor + 0.05 : MIN_FRACTION;
        const hi = rightNeighbor !== undefined ? rightNeighbor - 0.05 : MAX_FRACTION;
        const clamped = Math.min(
          Math.max(ratio, lo, MIN_FRACTION),
          hi,
          MAX_FRACTION,
        );
        const next = [...current];
        next[index] = clamped;
        splitFractions.set(slotSignature(slots), next);
        return next;
      });
    }
    function onUp(): void {
      dragIndexRef.current = null;
      document.body.classList.remove("mdr-dragging");
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [slots]);

  function startDrag(index: number): void {
    dragIndexRef.current = index;
    document.body.classList.add("mdr-dragging");
  }

  const children: ReactNode[] = [];
  slots.forEach((slot, index) => {
    let width: string | undefined;
    if (index === 0) {
      width = `calc(${(fractions[0] ?? 1) * 100}% - 4px)`;
    } else if (index < slots.length - 1) {
      const left = fractions[index - 1] ?? 0;
      const right = fractions[index] ?? 1;
      width = `calc(${(right - left) * 100}% - 8px)`;
    }
    children.push(
      <div
        key={slot.id}
        className="mdr-split-slot"
        // Sized slots must not grow/shrink — the class default
        // (`flex: 1 1 0`) is only for the last, filler slot.
        style={width ? { flexBasis: width, flexGrow: 0, flexShrink: 0 } : undefined}
      >
        {slot.content}
      </div>,
    );
    if (index < slots.length - 1) {
      children.push(
        <div
          key={`${slot.id}-divider`}
          className="mdr-divider"
          onMouseDown={() => startDrag(index)}
        />,
      );
    }
  });

  return <div className="mdr-split" ref={splitRef}>{children}</div>;
}

export default SplitLayout;
