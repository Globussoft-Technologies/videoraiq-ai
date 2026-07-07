import { useMemo } from "react";
import logo from "@/assets/logo.svg";
import camShot1 from "@/assets/1.jpg";
import camShot3 from "@/assets/3.jpg";
import camShot7 from "@/assets/7.jpg";
import camShot16 from "@/assets/16.jpg";
import camShot21 from "@/assets/21.jpg";
import camShot22 from "@/assets/22.jpg";
import camShot24 from "@/assets/24.jpg";
import camShot25 from "@/assets/25.jpg";
import camShot26 from "@/assets/26.jpg";
import camShot28 from "@/assets/28.jpg";

const CAM_SHOTS = [
  camShot1,
  camShot3,
  camShot7,
  camShot16,
  camShot21,
  camShot22,
  camShot24,
  camShot25,
  camShot26,
  camShot28,
];

/* ------- left hero: animated CCTV-style montage ------- */
const CAM_TINTS = [
  "linear-gradient(135deg,#0f1b2e,#142235)",
  "linear-gradient(135deg,#1a1430,#241a3a)",
  "linear-gradient(135deg,#0e2430,#13303a)",
  "linear-gradient(135deg,#231526,#301a2c)",
];

function CctvColumn({ nums, anim, dotColor }) {
  const tiles = nums.concat(nums); // duplicate for a seamless loop
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: anim }}>
        {tiles.map((n, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              aspectRatio: "16 / 10",
              borderRadius: 11,
              overflow: "hidden",
              border: "1px solid rgba(120,160,230,.16)",
              background: CAM_TINTS[n % CAM_TINTS.length],
              backgroundImage: `url(${CAM_SHOTS[n % CAM_SHOTS.length]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 7,
                left: 8,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 8.5,
                color: "#dbe6fb",
                background: "rgba(6,9,14,.6)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              CAM-{String(n).padStart(3, "0")}
            </span>
            {dotColor && (
              <span
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: dotColor,
                  boxShadow: `0 0 7px ${dotColor}`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Marketing / brand hero shown on the left of the auth screen. Purely
 * decorative — split out of UserForm to keep that file focused on the form.
 */
export default function AuthHero() {
  const colA = useMemo(() => [1, 4, 7, 10, 13, 16, 19, 22], []);
  const colB = useMemo(() => [2, 5, 8, 11, 14, 17, 20, 23], []);
  const colC = useMemo(() => [3, 6, 9, 12, 15, 18, 21, 24], []);

  return (
    <div
      className="vqlogin-hero"
      style={{
        flex: 1.18,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "46px 50px",
        minWidth: 0,
      }}
    >
      {/* CCTV montage */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 12,
          padding: 10,
          opacity: 0.34,
        }}
      >
        <CctvColumn nums={colA} anim="vqmUp 34s linear infinite" dotColor="#ff4d4d" />
        <CctvColumn nums={colB} anim="vqmDn 40s linear infinite" />
        <CctvColumn nums={colC} anim="vqmUp 46s linear infinite" dotColor="#22c55e" />
      </div>

      {/* scrim + grid + scan + glows */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(115deg,rgba(7,9,13,.93) 30%,rgba(7,9,13,.55) 62%,rgba(7,9,13,.86))",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(120,150,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,150,255,.05) 1px,transparent 1px)",
          backgroundSize: "46px 46px",
          animation: "vqgridpan 7s linear infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 160,
          top: 0,
          background: "linear-gradient(180deg,rgba(59,130,246,.16),transparent)",
          animation: "vqscan 6.5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(168,85,247,.20),transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -150,
          left: -90,
          width: 440,
          height: 440,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(59,130,246,.18),transparent 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* detection boxes */}
      <div
        style={{
          position: "absolute",
          left: "20%",
          top: "34%",
          width: 120,
          height: 92,
          border: "1.6px solid rgba(34,197,94,.85)",
          borderRadius: 4,
          animation: "vqbox 3.4s ease-in-out infinite",
          boxShadow: "0 0 18px rgba(34,197,94,.25)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: -17,
            left: -1,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8.5,
            color: "#0a1410",
            background: "#22c55e",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          PERSON 98%
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: "58%",
          top: "54%",
          width: 96,
          height: 74,
          border: "1.6px solid rgba(59,130,246,.85)",
          borderRadius: 4,
          animation: "vqbox 3.4s ease-in-out infinite .9s",
          boxShadow: "0 0 18px rgba(59,130,246,.25)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: -17,
            left: -1,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8.5,
            color: "#06101e",
            background: "#3b82f6",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          VEHICLE 94%
        </span>
      </div>

      {/* brand */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          gap: 13,
          animation: "vqfade .7s ease both",
        }}
      >
        <img src={logo} alt="VideoraIQ" style={{ height: 40, width: "auto", display: "block" }} />
      </div>

      {/* headline */}
      <div style={{ position: "relative", zIndex: 3, maxWidth: 520, animation: "vqfade .8s ease both .12s" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 13px",
            border: "1px solid rgba(120,160,230,.22)",
            borderRadius: 999,
            background: "rgba(12,16,26,.5)",
            backdropFilter: "blur(6px)",
            marginBottom: 22,
          }}
        >
          <span style={{ position: "relative", width: 7, height: 7 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e" }} />
            <span
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "1.5px solid #22c55e",
                animation: "vqblip 2.4s ease-out infinite",
              }}
            />
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10.5,
              letterSpacing: ".12em",
              color: "#aeb9d4",
            }}
          >
            AI VISION ENGINE · ONLINE
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontWeight: 700,
            fontSize: 46,
            lineHeight: 1.06,
            letterSpacing: "-.02em",
            margin: 0,
            color: "#f4f8ff",
          }}
        >
          See everything.
          <br />
          Miss nothing.
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#aab4cf", margin: "18px 0 0", maxWidth: 430 }}>
          Unified command for real-time AI surveillance — multi-site video, face &amp; ANPR recognition, and
          threat detection in a single intelligent console.
        </p>
      </div>

      {/* stats */}
      <div style={{ position: "relative", zIndex: 3, animation: "vqfade .9s ease both .24s" }}>
        <div style={{ display: "flex", gap: 30, marginBottom: 20 }}>
          {[
            { v: "1,310", l: "Cameras online", c: "#f4f8ff" },
            { v: "42", l: "AI detection models", c: "#f4f8ff" },
            { v: "99.98%", l: "Platform uptime", c: "#22c55e" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 30 }}>
              {i > 0 && <div style={{ width: 1, background: "rgba(255,255,255,.09)" }} />}
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 25, color: s.c }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 11.5, color: "#8e99b6", marginTop: 1 }}>{s.l}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Real-time AI detection", "ANPR & Vehicle", "Face & Watchlist", "Multi-site command"].map((f) => (
            <span
              key={f}
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10,
                letterSpacing: ".04em",
                color: "#9fa9c6",
                border: "1px solid rgba(120,160,230,.18)",
                background: "rgba(12,16,26,.45)",
                borderRadius: 7,
                padding: "5px 10px",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
