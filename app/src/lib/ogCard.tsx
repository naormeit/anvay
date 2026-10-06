import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };

/** 1200x630 preview card for link previews (WhatsApp, X, Slack…). */
export function ogCard(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#f7f4ee",
          color: "#1c1917",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "#c2410c",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            A
          </div>
          <div style={{ fontSize: 56, fontWeight: 700 }}>Anvay</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 36, color: "#78716c" }}>{subtitle}</div>
        </div>
      </div>
    ),
    ogSize,
  );
}
