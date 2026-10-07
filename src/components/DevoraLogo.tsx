import Image from "next/image";
import styles from "./DevoraLogo.module.css";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  showSub?: boolean;
};

/* The official Devora lockup (mark + wordmark + "Code Track Build Grow") as one image.
   The tagline is baked into the artwork, so `showSub` is accepted but no longer needed. */
const sizes = {
  sm: { w: 118, h: 34 },
  md: { w: 150, h: 43 },
  lg: { w: 195, h: 56 },
} as const;

export function DevoraLogo({ size = "md" }: LogoProps) {
  const { w, h } = sizes[size];
  return (
    <span className={styles.logoMark}>
      <Image
        src="/logo/devora-lockup-white.png"
        alt="Devora — Code Track Build Grow"
        width={w}
        height={h}
        priority
        className={styles.logoImg}
      />
    </span>
  );
}
