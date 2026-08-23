const SIZES = {
  sm: "thinking-animation--sm",
  md: "thinking-animation--md",
  lg: "thinking-animation--lg",
};

export function ThinkingAnimation({
  label = "Thinking",
  size = "md",
  showLabel = true,
  className = "",
  ...props
}) {
  const classes = [
    "thinking-animation",
    SIZES[size] ?? SIZES.md,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      role="status"
      aria-label={label}
      aria-live="polite"
      {...props}
    >
      <span className="thinking-animation__dots" aria-hidden="true">
        <span className="thinking-animation__dot" />
        <span className="thinking-animation__dot" />
        <span className="thinking-animation__dot" />
      </span>
      {showLabel ? (
        <span className="thinking-animation__label" aria-hidden="true">
          {label}
        </span>
      ) : null}
    </span>
  );
}
