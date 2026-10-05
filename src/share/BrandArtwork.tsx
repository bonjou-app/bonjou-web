export type ArtworkKind =
  "notes" | "studio" | "project" | "nearby" | "received";

/** Decorative owned imagery; the surrounding copy carries the meaning. */
export function BrandArtwork({
  kind,
  className = "",
  sizes = "176px",
}: {
  kind: ArtworkKind;
  className?: string;
  sizes?: string;
}) {
  const base = `/images/bonjou/${kind}`;
  return (
    <img
      className={`bonjou-art ${className}`}
      src={`${base}-512.webp`}
      srcSet={`${base}-256.webp 256w, ${base}-512.webp 512w`}
      sizes={sizes}
      width={512}
      height={512}
      loading="lazy"
      decoding="async"
      draggable={false}
      alt=""
      aria-hidden="true"
      data-bonjou-art={kind}
    />
  );
}
