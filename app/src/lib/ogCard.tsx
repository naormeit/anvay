import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const logo = `data:image/png;base64,${readFileSync(join(process.cwd(), "public/icons/icon-192.png")).toString("base64")}`;

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={88} height={88} style={{ borderRadius: 20 }} alt="" />
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
