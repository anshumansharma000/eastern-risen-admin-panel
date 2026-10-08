import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
  variant?: "on-dark" | "on-light";
};

export function BrandLogo({
  className,
  compact = false,
  priority = false,
  variant = "on-light",
}: BrandLogoProps) {
  const suffix = variant === "on-dark" ? "dark" : "light";

  return (
    <Image
      className={className}
      src={`/brand/eastern-risen-${compact ? "mark" : "logo"}-on-${suffix}.png`}
      alt="Eastern Risen"
      width={compact ? (variant === "on-dark" ? 330 : 321) : 922}
      height={compact ? (variant === "on-dark" ? 271 : 267) : 271}
      priority={priority}
    />
  );
}
