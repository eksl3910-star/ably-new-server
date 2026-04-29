"use client";

import { useEffect, useState } from "react";

type Settings = {
  isMaintenance: boolean;
  updatedAt: number;
};

type AdminStats = {
  totalUsers: number;
  todayUsers: number;
  totalLinks: number;
  queuedLinks: number;
  consumedLinks: number;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = (await res.json()) as Settings;
        if (!alive) return;
        setIsMaintenance(Boolean(data.isMaintenance));
      } catch {
        if (!alive) return;
        setError("설정 값을 불러오지 못했습니다.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function loadStats() {
    if (!adminPassword) {
      setError("관리자 비밀번호를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "통계 불러오기 실패");
      }
      const data = (await res.json()) as { ok: boolean; stats: AdminStats };
      setStats(data.stats);
    } catch {
      setError("통계 불러오기 실패. 비밀번호를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMaintenance(next: boolean) {
    if (busy) return;
    if (!adminPassword) {
      setError("관리자 비밀번호를 입력해주세요.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword, isMaintenance: next }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "업데이트 실패");
      }

      setIsMaintenance(next);
    } catch {
      setError("업데이트 실패. 비밀번호 또는 서버 설정을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-[#e7e9ee] bg-white p-6">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-[#1f2430]">
          관리자
        </h1>
        <p className="mt-2 text-sm text-[#7c8394]">
          여기서 서버 점검 모드를 켜고 끌 수 있어요.
        </p>

        <div className="mt-6 rounded-xl border border-[#e7e9ee] bg-[#fbfbfd] p-4">
          <label className="mb-4 block">
            <p className="mb-2 text-xs font-semibold text-[#1f2430]">
              관리자 비밀번호 확인
            </p>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="비밀번호 입력"
              className="h-11 w-full rounded-xl border border-[#d9dde6] bg-white px-3 text-sm text-[#1f2430] outline-none ring-0 placeholder:text-[#9aa3b2] focus:border-[#111]"
            />
          </label>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#1f2430]">현재 상태</p>
              <p className="mt-1 text-xs text-[#7c8394]">
                {loading
                  ? "불러오는 중..."
                  : isMaintenance
                    ? "점검 중 (전체 차단)"
                    : "정상 운영"}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isMaintenance ? "bg-[#ffe8ea] text-[#ff5a67]" : "bg-[#e9fbf0] text-[#14a44d]"
              }`}
            >
              {isMaintenance ? "MAINTENANCE" : "LIVE"}
            </span>
          </div>

          {error ? <p className="mt-3 text-sm text-[#ff4f5a]">{error}</p> : null}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              disabled={loading || busy || isMaintenance}
              onClick={() => toggleMaintenance(true)}
              className="h-12 w-full rounded-xl bg-[#111] text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              서버 전체 중단
            </button>
            <button
              disabled={loading || busy || !isMaintenance}
              onClick={() => toggleMaintenance(false)}
              className="h-12 w-full rounded-xl border border-[#e7e9ee] bg-white text-base font-bold text-[#1f2430] disabled:cursor-not-allowed disabled:opacity-50"
            >
              점검 해제
            </button>
          </div>

          <div className="mt-4">
            <button
              disabled={busy}
              onClick={loadStats}
              className="h-12 w-full rounded-xl bg-[#aa3bff] text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              통계 불러오기
            </button>
          </div>
        </div>

        {stats && (
          <div className="mt-6 rounded-xl border border-[#e7e9ee] bg-[#fbfbfd] p-4">
            <h2 className="text-lg font-bold text-[#1f2430] mb-4">통계</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white p-3 border border-[#e7e9ee]">
                <p className="text-xs text-[#7c8394]">전체 유저</p>
                <p className="text-2xl font-bold text-[#1f2430]">{stats.totalUsers}</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-[#e7e9ee]">
                <p className="text-xs text-[#7c8394]">오늘 가입</p>
                <p className="text-2xl font-bold text-[#ff5a5f]">{stats.todayUsers}</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-[#e7e9ee]">
                <p className="text-xs text-[#7c8394]">전체 링크</p>
                <p className="text-2xl font-bold text-[#1f2430]">{stats.totalLinks}</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-[#e7e9ee]">
                <p className="text-xs text-[#7c8394]">대기 중</p>
                <p className="text-2xl font-bold text-[#1f2430]">{stats.queuedLinks}</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-[#e7e9ee] col-span-2">
                <p className="text-xs text-[#7c8394]">소비된 링크</p>
                <p className="text-2xl font-bold text-[#14a44d]">{stats.consumedLinks}</p>
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-[#7c8394]">
          동작 원리: 관리자 API가 D1의 <code>settings</code> 테이블을 서버에서만 갱신합니다.
        </p>
      </div>
    </main>
  );
}

