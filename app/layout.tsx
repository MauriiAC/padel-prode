import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Padel Prode",
  description: "Prode de torneos de padel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
