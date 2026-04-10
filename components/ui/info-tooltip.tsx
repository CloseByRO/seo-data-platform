"use client";

type Props = {
  text: string;
  label?: string;
};

/** Accessible inline hint: hover/focus shows native tooltip via `title`. */
export function InfoTooltip({ text, label = "About this" }: Props) {
  return (
    <span className="inline-flex align-middle">
      <button
        type="button"
        title={text}
        aria-label={label}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black/20 text-[10px] font-semibold leading-none text-black/60 transition-colors hover:border-black/40 hover:text-black dark:border-white/25 dark:text-white/60 dark:hover:border-white/45 dark:hover:text-white"
      >
        ?
      </button>
    </span>
  );
}
