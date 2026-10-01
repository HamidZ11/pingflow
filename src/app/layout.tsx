import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default:
      "Pingflow — Keep using WhatsApp. Pingflow handles the admin behind it.",
    template: "%s — Pingflow",
  },
  description:
    "Customers message you as they always have. Pingflow checks your calendar, handles bookings, reschedules and reminders, and asks you before any booking changes.",
};

export const viewport: Viewport = {
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={instrumentSans.variable}>
      <body>{children}</body>
    </html>
  );
}
