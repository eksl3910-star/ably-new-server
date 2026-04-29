"use client";

import { useEffect, useState } from "react";

export default function MaintenancePage() {
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const checkStatus = async () => {
      try {
        if (alive) setChecking(true);
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { isMaintenance?: boolean };
        if (!alive) return;

        setLastCheckedAt(Date.now());
        if (data.isMaintenance === false) {
          window.location.href = "/";
        }
      } finally {
        if (alive) setChecking(false);
      }
    };

    checkStatus().catch(() => {});
    const id = window.setInterval(() => {
      checkStatus().catch(() => {});
    }, 10_000);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div id="nickname-screen">
      <div className="card" style={{ width: "100%", maxWidth: 480, textAlign: "left" }}>
        <div className="card-title">SERVER STATUS</div>
        <h2 style={{ marginBottom: 10 }}>현재 점검 중입니다</h2>
        <p style={{ color: "#666", lineHeight: 1.7, marginBottom: 14 }}>
          더 안정적인 서비스 제공을 위해 잠시 점검을 진행하고 있어요.
          <br />
          점검이 끝나면 자동으로 다시 이용하실 수 있습니다.
        </p>

        <div className="notice-box" style={{ marginBottom: 0 }}>
          <div className="notice-item">🛠️ 점검 중에는 링크 업로드/받기가 일시 중지돼요.</div>
          <div className="notice-item">🔒 관리자 페이지는 내부 점검 해제를 위해 계속 열려 있어요.</div>
          <div className="notice-item">🙏 이용에 불편을 드려 죄송합니다. 조금만 기다려주세요.</div>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: "#8a8a8a" }}>
          {checking ? "점검 상태를 실시간으로 확인 중입니다..." : "10초마다 점검 상태를 확인합니다."}
          {lastCheckedAt ? ` (최근 확인: ${new Date(lastCheckedAt).toLocaleTimeString()})` : ""}
        </p>
      </div>
    </div>
  );
}

