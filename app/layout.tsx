import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macrofactor — AROMI AI Wellness",
  description: "One AI wellness coach: food logging, calorie estimation, workouts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
