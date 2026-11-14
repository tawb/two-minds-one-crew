const STAR = 'M12 0C12 7 17 12 24 12C17 12 12 17 12 24C12 17 7 12 0 12C7 12 12 7 12 0Z';

/** Decorative lilac four-point stars and soft corner circles. Purely visual. */
export function Star({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`star ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={STAR} />
    </svg>
  );
}

export default function Sparkles() {
  return (
    <div className="deco" aria-hidden="true">
      <span className="circle c1" />
      <span className="circle c2" />
      <Star size={30} className="s1" />
      <Star size={16} className="s2" />
      <Star size={22} className="s3" />
      <Star size={12} className="s4" />
    </div>
  );
}
