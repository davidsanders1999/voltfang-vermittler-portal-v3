import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Voltfang Partner Portal",
  description: "Voltfang Vermittler & Vertriebspartner Portal",
  icons: { icon: "/mini-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${poppins.variable} h-full`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-poppins)]">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
