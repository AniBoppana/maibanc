export default function ComingSoon({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10">
      <div className="mc-card max-w-sm px-8 py-10 text-center">
        <h1 className="font-display text-xl font-bold text-charcoal">{label}</h1>
        <p className="mt-3 font-body text-[13.5px] leading-relaxed text-charcoal-soft">
          Not yet rebuilt in the new design system — queued right after the current
          feature pages are done.
        </p>
      </div>
    </div>
  );
}
