import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "JoyOrGenie — intent into action",
  description: "A location-aware personal genie that turns intent into trusted, approval-gated action.",
  openGraph: {
    title: "JoyOrGenie — intent into action",
    description: "Remember what matters, compare the real world, and approve before anything is committed.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
