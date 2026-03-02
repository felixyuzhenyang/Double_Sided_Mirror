import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Double-Sided Mirror | Pennsylvania Civic AI",
  description:
    "Citizen and government staff collaboration portal for Pennsylvania service workflows with AI-assisted intake, policy guidance, and accountable staff responses."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
