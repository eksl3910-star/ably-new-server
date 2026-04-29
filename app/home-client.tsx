"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Stats = { queued: number; myQueued: number };
type Claim =
  | { ok: false; reason: string }
  | { ok: true; link: { id: string; url: string; expiresAt: number } };

export default function HomeClient() {
  const [nickname, setNickname] = useState("");
  const [nickInput, setNickInput] = useState("");
  const [nickError, setNickError] = useState("");

  const [maintenance, setMaintenance] = useState(false);

  const [stats, setStats] = useState<Stats>({ queued: 0, myQueued: 0 });
  const [alert, setAlert] = useState<{ kind: "success" | "danger" | "info" | "warning"; text: string } | null>(
    null
  );

  const [busy, setBusy] = useState(false);
  const [claim, setClaim] = useState<{ id: string; url: string; expiresAt: number } | null>(null);
  const [remaining, setRemaining] = useState(0);

  const [showGuide, setShowGuide] = useState(false);
  const timerRef = useRef<number | null>(null);

  const effectiveNick = useMemo(() => nickname.trim(), [nickname]);

  const refreshSettings = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const data = (await res.json()) as { isMaintenance?: boolean };
    setMaintenance(Boolean(data.isMaintenance));
  }, []);

  const refreshStats = useCallback(async () => {
    if (!effectiveNick) return;
    const res = await fetch(`/api/links/stats?nickname=${encodeURIComponent(effectiveNick)}`, { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean; queued?: number; myQueued?: number };
    if (data && data.ok) setStats({ queued: data.queued ?? 0, myQueued: data.myQueued ?? 0 });
  }, [effectiveNick]);

  useEffect(() => {
    refreshSettings().catch(() => {});
  }, [refreshSettings]);

  useEffect(() => {
    if (!effectiveNick) return;
    refreshStats().catch(() => {});
  }, [effectiveNick, refreshStats]);

  useEffect(() => {
    if (!claim) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setRemaining(0);
      return;
    }

    const tick = () => {
      const sec = Math.max(0, Math.ceil((claim.expiresAt - Date.now()) / 1000));
      setRemaining(sec);
      if (sec <= 0) {
        // best-effort return
        fetch("/api/links/return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: effectiveNick, linkId: claim.id }),
        }).catch(() => {});
        setClaim(null);
        setAlert({ kind: "warning", text: "⏱️ 시간이 지나서 자동 반납됐어요." });
      }
    };

    tick();
    timerRef.current = window.setInterval(tick, 250);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [claim, effectiveNick]);

  async function confirmNickname() {
    const n = nickInput.trim();
    if (!n) {
      setNickError("닉네임을 입력해주세요.");
      return;
    }
    setNickError("");
    setNickname(n);
    setAlert({ kind: "info", text: "📋 박스를 눌러서 링크를 올려주세요." });
  }

  async function handlePasteBox() {
    if (!effectiveNick) return;
    if (maintenance) return;
    if (busy) return;
    setBusy(true);
    setAlert(null);

    try {
      const text = await navigator.clipboard.readText();
      const res = await fetch("/api/links/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: effectiveNick, text }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "업로드 실패");
      setAlert({ kind: "success", text: "✅ 내 링크를 대기열에 올렸어요!" });
      await refreshStats();
    } catch {
      setAlert({
        kind: "danger",
        text: maintenance
          ? "현재 점검 중이라 링크를 올릴 수 없어요."
          : "링크를 올리지 못했어요. 복사된 내용/권한을 확인해주세요.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRequeue() {
    if (!effectiveNick) return;
    if (maintenance) return;
    if (busy) return;
    setBusy(true);
    setAlert(null);
    try {
      const res = await fetch("/api/links/requeue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: effectiveNick }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "실패");
      setAlert({ kind: "success", text: "🔄 내 링크를 대기열 맨 앞으로 보냈어요!" });
      await refreshStats();
    } catch {
      setAlert({ kind: "warning", text: "대기열에 올린 링크가 없어요." });
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive() {
    if (!effectiveNick) return;
    if (maintenance) return;
    if (busy || claim) return;
    setBusy(true);
    setAlert(null);
    try {
      const res = await fetch("/api/links/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: effectiveNick }),
      });
      const data = (await res.json()) as Claim;
      if (res.status === 503) {
        setAlert({ kind: "warning", text: "현재 점검 중이라 링크를 받을 수 없어요." });
        return;
      }
      if (!data.ok) {
        setAlert({ kind: "info", text: "지금은 받을 링크가 없어요. 잠시 후 다시 눌러주세요!" });
        return;
      }
      setClaim(data.link);
      setAlert({ kind: "success", text: "🎁 링크를 받았어요! 5초 안에 눌러야 해요." });
      await refreshStats();
    } catch {
      setAlert({ kind: "danger", text: "받기 실패. 잠시 후 다시 시도해주세요." });
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen() {
    if (!effectiveNick || !claim) return;
    if (maintenance) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/links/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: effectiveNick, linkId: claim.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; reason?: string };
      if (!res.ok || !data.ok || !data.url) throw new Error(data.reason || "실패");

      window.open(data.url, "_blank", "noopener,noreferrer");
      setClaim(null);
      setAlert({ kind: "success", text: "✅ 열었어요! 다음 링크도 받아볼까요?" });
      await refreshStats();
    } catch {
      setClaim(null);
      setAlert({ kind: "warning", text: "시간이 지났거나 이미 반납된 링크예요." });
      await refreshStats();
    } finally {
      setBusy(false);
    }
  }

  async function handleReturn() {
    if (!effectiveNick || !claim) return;
    if (maintenance) return;
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/links/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: effectiveNick, linkId: claim.id }),
      });
    } finally {
      setClaim(null);
      setBusy(false);
      refreshStats().catch(() => {});
    }
  }

  if (!effectiveNick) {
    return (
      <div id="nickname-screen">
        <h2>닉네임을 입력해주세요</h2>
        <p>닉네임은 화면 표시와 링크 매칭에 사용돼요.</p>
        <input value={nickInput} onChange={(e) => setNickInput(e.target.value)} placeholder="예) 홍길동" />
        <button className="start-btn" onClick={confirmNickname}>
          시작하기
        </button>
        <div id="nick-error">{nickError}</div>
      </div>
    );
  }

  if (maintenance) {
    return (
      <div id="nickname-screen">
        <h2>현재 점검 중입니다</h2>
        <p>관리자가 점검 모드를 활성화했어요. 잠시 후 다시 접속해주세요.</p>
      </div>
    );
  }

  return (
    <div id="app">
      <header className="topbar">
        <h1>ably-link</h1>
        <div className="topbar-right">
          <div className="user">
            닉네임 <span>{effectiveNick}</span>
          </div>
          <button className="help-btn" onClick={() => setShowGuide(true)}>
            사용방법
          </button>
        </div>
      </header>

      <section className="section">
        <div className="card">
          <div className="card-title">내 링크 올리기</div>
          <div className="paste-box" role="button" tabIndex={0} onClick={handlePasteBox}>
            <div className="icon">📋</div>
            <div className="hint">복사한 상태로 여기를 탭하면 바로 올라가요</div>
            <div className="sub">에이블리 링크(a-bly.com)만 가능</div>
          </div>
          <button className="requeue-btn" onClick={handleRequeue}>
            내 링크를 대기열 맨 앞으로 보내기
          </button>
        </div>

        <div className="stat-single" onClick={() => refreshStats().catch(() => {})}>
          <div className="num">{stats.queued}</div>
          <div className="lbl">
            대기 중 링크 <span className="refresh">↻</span>
          </div>
        </div>

        {alert ? <div className={`alert alert-${alert.kind}`} id="receive-alert">{alert.text}</div> : <div id="receive-alert" />}

        <button id="receive-btn" disabled={busy || Boolean(claim)} onClick={handleReceive}>
          남의 링크 받기
        </button>

        {claim ? (
          <div className="link-card">
            <div className="label">받은 링크</div>
            <div className="link-url-box">{claim.url}</div>
            <div className="timer-wrap">
              <div className={`timer ${remaining <= 2 ? "urgent" : ""}`}>{remaining}</div>
              <div className="timer-sub">초 안에 누르지 않으면 자동 반납돼요</div>
            </div>
            <a className="open-btn" href="#" onClick={(e) => (e.preventDefault(), handleOpen())}>
              에이블리에서 열기 →
            </a>
            <button className="return-btn" onClick={handleReturn}>
              반납하기
            </button>
          </div>
        ) : null}
      </section>

      {showGuide ? (
        <div className="overlay" onClick={(e) => (e.target as HTMLElement).className === "overlay" && setShowGuide(false)}>
          <div className="popup">
            <div className="popup-header">
              <h2>사용방법</h2>
              <button className="popup-close" onClick={() => setShowGuide(false)}>
                ✕
              </button>
            </div>

            <div className="guide-step">
              <div className="guide-num">1</div>
              <div className="guide-content">
                <div className="title">에이블리에서 내 링크 복사하기</div>
                <div className="desc">에이블리 앱에서 이벤트 링크를 새로 만들고 복사해요. 카카오톡 메시지 전체를 복사해도 돼요!</div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-num">2</div>
              <div className="guide-content">
                <div className="title">📋 박스 터치하면 바로 올라가요</div>
                <div className="desc">복사한 상태에서 박스를 터치해요. 권한 허용 팝업이 뜨면 반드시 허용을 눌러주세요!</div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-num">3</div>
              <div className="guide-content">
                <div className="title">빨간 버튼으로 남의 링크 받기</div>
                <div className="desc">버튼을 누르면 다른 사람 링크 1개가 나한테만 와요. 받으면 5초 안에 눌러야 해요!</div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-num">4</div>
              <div className="guide-content">
                <div className="title">반복하면 응모 티켓이 쌓여요</div>
                <div className="desc">에이블리에서 새 링크 만들고 → 올리고 → 받기. 이걸 반복하면 돼요!</div>
              </div>
            </div>

            <hr className="guide-divider" />

            <div className="notice-box">
              <div className="notice-item">⚡ 동시에 눌러도 딱 1명만 받을 수 있어요</div>
              <div className="notice-item">🚫 한 사람 링크는 딱 1번만 받을 수 있어요</div>
              <div className="notice-item">⏱️ 5초 안에 안 누르면 자동으로 반납돼요</div>
              <div className="notice-item">🔗 에이블리 링크(a-bly.com)만 올릴 수 있어요</div>
              <div className="notice-item">🔄 내 링크를 대기열 맨 앞으로 다시 올릴 수 있어요</div>
            </div>

            <button
              className="dont-show-btn"
              onClick={() => {
                setShowGuide(false);
              }}
            >
              다시 보지 않기
            </button>
            <button className="close-only-btn" onClick={() => setShowGuide(false)}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

