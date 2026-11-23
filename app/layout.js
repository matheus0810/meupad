import "./globals.css";

export const metadata = { title: "Meu Pad", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
