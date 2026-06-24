import "./globals.css";

export const metadata = {
  title: "Momentum Transcribe",
  description: "Drag-and-drop audio transcription powered by Groq Whisper.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
