import mark from "./brandMark.json";

/** Approved lowercase b with two connected peers cut out of its bowl. */
export function Logo({ size = 18, tone = mark.color }: { size?: number; tone?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={mark.viewBox}
      fill={tone}
      aria-hidden="true"
      focusable="false"
      className="bj-logo-mark"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={mark.path}
      />
    </svg>
  );
}

/** Mark plus wordmark, used in both mastheads and the footer. */
export function Wordmark({
  size = 18,
  tag = "web",
  className,
}: {
  size?: number;
  tag?: string | null;
  className?: string;
}) {
  return (
    <span className={className ? `wordmark ${className}` : "wordmark"}>
      <Logo size={size} />
      <span className="wordmark-name">bonjou</span>
      {tag ? <span className="wordmark-tag">{tag}</span> : null}
    </span>
  );
}
