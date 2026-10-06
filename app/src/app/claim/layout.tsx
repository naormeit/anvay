import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You've been sent money · Anvay",
  description: "Tap to collect it. Sign in with your phone or email. Nothing to install.",
  openGraph: {
    title: "You've been sent money",
    description: "Tap to collect it on Anvay. Sign in with your phone or email. Nothing to install.",
  },
};

export default function ClaimLayout({ children }: LayoutProps<"/claim">) {
  return children;
}
