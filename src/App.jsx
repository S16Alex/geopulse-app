import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { api, supabase, stopWithKeepalive } from './supabase';
import { AVATARS, avatarById } from './avatars';
import './styles.css';

function readPendingInvite() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('invite');

  if (code) {
    try {
      sessionStorage.setItem('gp_pending_invite', code);
    } catch {}

    // 초대 코드는 주소창에서 지웁니다.
    // 인증용 access_token 해시는 invite가 있을 때만 해당하므로 건드리지 않습니다.
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
    return code;
  }

  try {
    return sessionStorage.getItem('gp_pending_invite') || '';
  } catch {
    return '';
  }
}

const INITIAL_INVITE = readPendingInvite();

function normalizeInvite(value) {
  const text = value.trim();

  if (text.includes('://')) {
    try {
      const url = new URL(text);
      return new URLSearchParams(url.hash.slice(1)).get('invite') || '';
    } catch {
      return '';
    }
  }

  return text.toLowerCase();
}

function errorText(error) {
  if (error?.code === 1) return '브라우저에서 위치 권한을 허용해 주세요.';
  if (error?.code === 2) return '위치를 확인할 수 없습니다.';
  if (error?.code === 3) return '위치 확인 시간이 초과되었습니다.';
  return error?.message || '요청 처리 중 오류가 발생했습니다.';
}

/* ---------- 인증 ---------- */

function AuthPanel() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const credentials = { email: email.trim(), password };
      const result = mode === 'signup'
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: `${window.location.origin}/` },
          })
        : await supabase.auth.signInWithPassword(credentials);

      if (result.error) throw result.error;

      if (mode === 'signup' && !result.data.session) {
        setMessage(
          '가입 요청이 처리되었습니다. 인증 메일을 확인한 뒤 로그인해 주세요.'
        );
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email.trim()) {
      setMessage('먼저 이메일을 입력해 주세요.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      setMessage('인증 메일 재발송을 요청했습니다. 메일함을 확인해 주세요.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <div className="brand">GeoPulse</div>
        <h1>우리 위치, 귀여운 캐릭터로</h1>
        <p className="muted">
          초대한 그룹끼리만 위치를 공유합니다.
          가입만으로 위치가 전송되지는 않습니다.
        </p>

        <div className="avatar-preview">
          {AVATARS.map((item) => (
            <img key={item.id} src={item.src} alt={item.name} />
          ))}
        </div>

        <form className="stack" onSubmit={submit}>
          <label>
            이메일
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              minLength={mode === 'signup' ? 10 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {mode === 'signup' && (
            <small className="muted">비밀번호는 10자 이상 입력하세요.</small>
          )}

          <button disabled={busy}>
            {busy ? '처리 중…' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
        </form>

        <div className="row wrap">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setPassword('');
              setMessage('');
            }}
          >
            {mode === 'login' ? '처음이신가요? 회원가입' : '로그인으로 돌아가기'}
          </button>

          <button className="secondary" disabled={busy} onClick={resend}>
            인증 메일 재발송
          </button>
        </div>

        {message && <p className="notice" role="status">{message}</p>}
      </section>
    </main>
  );
}

/* ---------- 그룹 상태 / 실시간 변경 알림 ---------- */

function useGroupState() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('연결 준비 중');
  const refreshRef = useRef(async () => {});
  const groupId = data?.group?.id || null;

  useEffect(() => {
    let alive = true;
    let busy = false;
    let again = false;
    let scheduled = null;
    let channel = null;

    async function pull() {
      if (!alive || document.hidden) return;

      if (busy) {
        again = true;
        return;
      }

      busy = true;
      const started = performance.now();

      try {
        const next = await api('state');
        if (alive && !document.hidden) {
          const received = performance.now();
          setData({
            ...next,
            _receivedAt: received,
            _rtt: received - started,
          });
          setError('');
        }
      } catch (failure) {
        if (alive) setError(errorText(failure));
      } finally {
        busy = false;
        if (again && alive) {
          again = false;
          schedule();
        }
      }
    }

    function schedule() {
      if (!alive || scheduled !== null) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        void pull();
      }, 200);
    }

    function onVisibility() {
      if (document.hidden) {
        // 다시 열었을 때 오래된 마커가 먼저 보이지 않도록 제거합니다.
        setData((previous) =>
          previous ? { ...previous, members: [] } : previous
        );
      } else {
        void pull();
      }
    }

    refreshRef.current = pull;
    void pull();

    // Realtime 연결 실패나 누락에 대비한 보조 동기화입니다.
    const interval = setInterval(() => void pull(), 10000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', schedule);

    if (groupId) {
      setConnection('실시간 연결 중');

      channel = supabase
        .channel(`gp-events:${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'gp_events',
            filter: `group_id=eq.${groupId}`,
          },
          schedule
        )
        .subscribe((status) => {
          if (!alive) return;

          if (status === 'SUBSCRIBED') {
            setConnection('실시간 연결');
            schedule();
          } else if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            setConnection('10초 간격 보조 동기화');
          }
        });
    } else {
      setConnection('그룹 참여 대기');
    }

    return () => {
      alive = false;
      clearInterval(interval);
      if (scheduled !== null) clearTimeout(scheduled);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', schedule);
      if (channel) void supabase.removeChannel(channel);
      if (refreshRef.current === pull) {
        refreshRef.current = async () => {};
      }
    };
  }, [groupId]);

  return { data, error, connection, refreshRef };
}

/* ---------- 화면이 보이는 동안의 위치 공유 ---------- */

function useForegroundLocation(session, refreshRef) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('위치 공유가 꺼져 있습니다.');
  const runRef = useRef(null);
  const mounted = useRef(true);
  const tokenRef = useRef(session.access_token);
  tokenRef.current = session.access_token;

  const stop = useCallback(async (
    { background = false, silent = false } = {}
  ) => {
    const run = runRef.current;
    if (!run) return true;

    run.cancelled = true;
    clearTimeout(run.timer);
    runRef.current = null;

    if (mounted.current) {
      setActive(false);
      setStatus(
        background
          ? '화면을 벗어나 공유를 멈췄습니다. 필요하면 다시 시작하세요.'
          : '위치 전송을 중지했습니다. 서버에 중지를 전달하고 있습니다.'
      );
    }

    try {
      // 시작 요청보다 종료 요청이 먼저 처리되는 것을 피합니다.
      await run.ready;

      if (background) {
        await stopWithKeepalive(run.id, tokenRef.current);
      } else {
        await api('stop', { session: run.id });
      }

      if (mounted.current && !background) {
        setStatus('공유를 중지하고 서버의 현재 좌표를 삭제했습니다.');
        void refreshRef.current();
      }
      return true;
    } catch {
      if (mounted.current && !silent) {
        setStatus(
          '새 위치 전송은 중단했습니다. 중지 확인에 실패해 마지막 위치는 서버 수신 후 최대 45초까지 남을 수 있습니다.'
        );
      }
      return false;
    }
  }, [refreshRef]);

  useEffect(() => {
    mounted.current = true;

    function onHidden() {
      if (document.hidden) void stop({ background: true });
    }

    function onPageHide() {
      void stop({ background: true });
    }

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      void stop({ background: true, silent: true });
    };
  }, [stop]);

  async function start() {
    if (runRef.current || document.hidden) return;

    if (!window.isSecureContext || !navigator.geolocation) {
      setStatus('HTTPS 환경과 위치 정보 기능이 필요합니다.');
      return;
    }

    const run = {
      id: crypto.randomUUID(),
      cancelled: false,
      timer: null,
      ready: null,
    };

    runRef.current = run;
    setActive(true);
    setStatus('공유를 준비하고 위치를 확인합니다.');

    run.ready = api('start', { session: run.id });

    async function sample() {
      if (run.cancelled || document.hidden) return;

      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
          });
        });

        // 위치 권한 응답이 늦게 도착하더라도 중지 뒤에는 전송하지 않습니다.
        if (run.cancelled || document.hidden) return;

        if (Math.abs(Date.now() - position.timestamp) > 15000) {
          throw new Error('새 위치를 확인하지 못했습니다. 다시 시작해 주세요.');
        }

        await api('publish', {
          session: run.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });

        if (!run.cancelled && mounted.current) {
          setStatus(
            `위치 공유 중 · GPS 정확도 약 ${Math.round(
              position.coords.accuracy
            )}m`
          );
          void refreshRef.current();
        }
      } catch (error) {
        if (!run.cancelled) {
          const reason = errorText(error);
          const stopped = await stop();

          if (mounted.current) {
            setStatus(
              `공유를 멈췄습니다: ${reason}` +
              (stopped
                ? ''
                : ' 마지막 위치는 서버 수신 후 최대 45초까지 남을 수 있습니다.')
            );
          }
        }
      } finally {
        if (!run.cancelled) {
          run.timer = setTimeout(() => void sample(), 5000);
        }
      }
    }

    try {
      await run.ready;
      if (!run.cancelled) void sample();
    } catch (error) {
      if (runRef.current === run) {
        runRef.current = null;
        run.cancelled = true;
        if (mounted.current) {
          setActive(false);
          setStatus(errorText(error));
        }
      }
    }
  }

  return { active, status, start, stop };
}

/* ---------- 네이버 지도 / 캐릭터 마커 ---------- */
let naverPromise;

function loadNaver() {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (naverPromise) return naverPromise;

  const clientId = (import.meta.env.VITE_NAVER_MAP_CLIENT_ID || '').trim();
  if (!clientId) {
    return Promise.reject(
      new Error('VITE_NAVER_MAP_CLIENT_ID를 설정하고 다시 배포해 주세요.')
    );
  }

  naverPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      naverPromise = null;
      reject(new Error('네이버 지도 연결 시간이 초과되었습니다.'));
    }, 15000);

    window.navermap_authFailure = () => {
      clearTimeout(timeout);
      naverPromise = null;
      reject(new Error('네이버 Client ID와 허용 도메인을 확인해 주세요.'));
    };

    const existing = document.getElementById('gp-naver-sdk');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = 'gp-naver-sdk';
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    
    script.onload = () => {
      let attempts = 0;
      const checkReady = () => {
        if (window.naver && window.naver.maps && window.naver.maps.Map) {
          clearTimeout(timeout);
          resolve(window.naver.maps);
        } else if (attempts < 50) {
          attempts += 1;
          setTimeout(checkReady, 100);
        } else {
          clearTimeout(timeout);
          naverPromise = null;
          reject(new Error('네이버 지도 SDK를 초기화하지 못했습니다. Client ID 종류(Web Dynamic Map)를 확인해 주세요.'));
        }
      };
      checkReady();
    };

    script.onerror = () => {
      clearTimeout(timeout);
      naverPromise = null;
      reject(new Error('네이버 지도 스크립트를 불러오지 못했습니다.'));
    };

    document.head.appendChild(script);
  });

  return naverPromise;
}

function markerIcon(maps, member, isMe) {
  const root = document.createElement('div');
  root.style.cssText = 'width:104px;text-align:center;';

  const image = document.createElement('img');
  image.src = avatarById(member.avatar).src;
  image.alt = '';
  image.width = 64;
  image.height = 64;
  image.style.cssText = 'display:block;margin:0 auto;max-width:none;';

  const label = document.createElement('div');
  label.textContent = `${member.name}${isMe ? ' · 나' : ''}`;
  label.style.cssText = [
    'padding:3px 6px',
    'border-radius:10px',
    'font-size:12px',
    'font-weight:700',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'box-shadow:0 2px 8px #0004',
    isMe ? 'background:#059669;color:white' : 'background:white;color:#0f172a',
  ].join(';');

  root.append(image, label);

  return {
    content: root.outerHTML,
    size: new maps.Size(104, 88),
    anchor: new maps.Point(52, 64),
  };
}

function LocationMap({ members, myId, focus }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef(new Map());
  const centered = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let map = null;
    let observer = null;

    const authFailure = () => {
      if (alive) setError('네이버 지도 키 또는 허용 도메인을 확인해 주세요.');
    };

    loadNaver()
      .then((maps) => {
        if (!alive || !element.current) return;

        window.navermap_authFailure = authFailure;

        map = new maps.Map(element.current, {
          center: new maps.LatLng(37.5665, 126.978),
          zoom: 16,
          zoomControl: true,
          scaleControl: true,
          logoControl: true,
          mapDataControl: true,
        });

        mapRef.current = map;
        centered.current = false;
        setReady(true);

        if (window.ResizeObserver) {
          observer = new ResizeObserver(() => {
            if (!element.current) return;
            map.setSize(new maps.Size(
              element.current.clientWidth,
              element.current.clientHeight
            ));
          });
          observer.observe(element.current);
        }
      })
      .catch((failure) => {
        if (alive) setError(errorText(failure));
      });

    return () => {
      alive = false;
      observer?.disconnect();
      markers.current.forEach(({ marker }) => marker.setMap(null));
      markers.current.clear();
      if (map) map.destroy?.();
      mapRef.current = null;
      if (window.navermap_authFailure === authFailure) {
        window.navermap_authFailure = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const maps = window.naver.maps;
    const present = new Set(members.map((member) => member.id));

    markers.current.forEach(({ marker }, id) => {
      if (!present.has(id)) {
        marker.setMap(null);
        markers.current.delete(id);
      }
    });

    members.forEach((member) => {
      const position = new maps.LatLng(member.lat, member.lng);
      const signature = JSON.stringify([
        member.name,
        member.avatar,
        member.id === myId,
      ]);
      const existing = markers.current.get(member.id);

      if (existing) {
        existing.marker.setPosition(position);
        if (existing.signature !== signature) {
          existing.marker.setIcon(
            markerIcon(maps, member, member.id === myId)
          );
          existing.signature = signature;
        }
      } else {
        markers.current.set(member.id, {
          signature,
          marker: new maps.Marker({
            map: mapRef.current,
            position,
            title: member.name,
            icon: markerIcon(maps, member, member.id === myId),
          }),
        });
      }
    });

    const me = members.find((member) => member.id === myId);
    if (me && !centered.current) {
      mapRef.current.setCenter(new maps.LatLng(me.lat, me.lng));
      centered.current = true;
    }
  }, [members, myId, ready]);

  useEffect(() => {
    if (!ready || !focus || !mapRef.current) return;
    mapRef.current.panTo(
      new window.naver.maps.LatLng(focus.lat, focus.lng)
    );
  }, [focus, ready]);

  return (
    <section className="map-shell">
      <div className="map" ref={element} />
      {(!ready || error) && (
        <div className="map-message">
          {error || '네이버 지도를 불러오는 중…'}
        </div>
      )}
    </section>
  );
}

/* ---------- 프로필 ---------- */

function ProfileForm({ me, busy, onSave }) {
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);

  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ name, avatar });
      }}
    >
      <h2>내 캐릭터와 닉네임</h2>

      <label>
        닉네임
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          required
        />
      </label>

      <div className="avatar-picker">
        {AVATARS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`avatar-option ${avatar === item.id ? 'selected' : ''}`}
            aria-pressed={avatar === item.id}
            onClick={() => setAvatar(item.id)}
          >
            <img src={item.src} alt="" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      <button disabled={busy}>프로필 저장</button>
    </form>
  );
}

/* ---------- 로그인 후 화면 ---------- */

function Workspace({ session }) {
  const { data, error, connection, refreshRef } = useGroupState();
  const gps = useForegroundLocation(session, refreshRef);
  const [now, setNow] = useState(performance.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [groupName, setGroupName] = useState('우리 모임');
  const [joinCode, setJoinCode] = useState(INITIAL_INVITE);
  const [inviteCode, setInviteCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [focus, setFocus] = useState(null);
  const groupId = data?.group?.id || null;
  const stop = gps.stop;

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setConsent(false);
    setFocus(null);
    return () => {
      void stop({ background: true, silent: true });
    };
  }, [groupId, stop]);

  async function perform(action, payload = {}) {
    setBusy(true);
    setNotice('');

    try {
      const result = await api(action, payload);

      if (result?.invite_code) setInviteCode(result.invite_code);

      if (action === 'join') {
        try { sessionStorage.removeItem('gp_pending_invite'); } catch {}
        setJoinCode('');
      }

      if (action === 'leave') setInviteCode('');

      setNotice(
        action === 'profile'
          ? '프로필을 저장했습니다.'
          : action === 'create' || action === 'join'
            ? '그룹에 참여했습니다. 위치는 공유 시작을 눌러야 전송됩니다.'
            : action === 'invite'
              ? '새 초대를 발급했습니다. 이전 초대는 무효입니다.'
              : '처리했습니다.'
      );

      await refreshRef.current();
    } catch (failure) {
      setNotice(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await stop();

    const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
    if (failure) {
      setNotice(errorText(failure));
      setBusy(false);
    }
  }

  async function leaveGroup() {
    if (!window.confirm('이 그룹에서 나가고 내 위치 공유를 종료할까요?')) return;
    await stop();
    await perform('leave');
  }

  const inviteLink = inviteCode
    ? `${window.location.origin}/#invite=${inviteCode}`
    : '';

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNotice('초대 링크를 복사했습니다.');
    } catch {
      setNotice('자동 복사에 실패했습니다. 아래 초대 링크를 직접 복사하세요.');
    }
  }

  if (!data) {
    return (
      <main className="shell">
        <section className="card stack">
          <h1>그룹 정보를 불러오는 중…</h1>
          {error && <p className="notice">{error}</p>}
          <button onClick={() => void refreshRef.current()}>다시 시도</button>
          <button className="secondary" onClick={logout} disabled={busy}>
            로그아웃
          </button>
        </section>
      </main>
    );
  }

  // 기기 시각 대신 서버 기준 남은 유효 시간과 단조 증가 시간을 사용합니다.
  // 왕복 시간을 보수적으로 차감하여 오래된 마커를 일찍 제거합니다.
  const elapsed =
    Math.max(0, now - data._receivedAt) + data._rtt;

  const visibleMembers = data.members.filter((member) => (
    Number.isFinite(member.lat) &&
    Number.isFinite(member.lng) &&
    member.expires_at &&
    Date.parse(member.expires_at) - Date.parse(data.server_time) > elapsed
  ));

  const visibleIds = new Set(visibleMembers.map((member) => member.id));
  const owner = data.group?.owner_id === data.me.id;

  return (
    <main className="shell">
      <header className="app-header">
        <div>
          <div className="brand">GeoPulse</div>
          <div className="muted">{data.group?.name || '그룹 참여 전'}</div>
        </div>
        <button className="secondary" onClick={logout} disabled={busy}>
          로그아웃
        </button>
      </header>

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && (
        <p className="notice warning" role="alert">
          서버 통신 확인 필요: {error}
        </p>
      )}

      {data.group && (
        <>
          <LocationMap
            members={visibleMembers}
            myId={data.me.id}
            focus={focus}
          />

          <section className="card stack">
            <div className="row between">
              <h2>내 위치 공유</h2>
              <span className="pill">{connection}</span>
            </div>

            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={gps.active}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                내 정밀 위치를 현재 그룹 구성원에게 공유하는 데 동의합니다.
              </span>
            </label>

            <p className="muted small">
              화면을 벗어나면 새 위치 전송을 멈춥니다.
              종료 요청이 전달되지 않으면 마지막 위치는 서버 수신 후
              최대 45초까지 표시될 수 있습니다.
            </p>

            <button
              className={gps.active ? 'danger' : ''}
              disabled={busy || (!gps.active && !consent)}
              onClick={() => {
                if (gps.active) void stop();
                else void gps.start();
              }}
            >
              {gps.active ? '위치 공유 중지' : '위치 공유 시작'}
            </button>

            <p className="muted small" role="status">{gps.status}</p>
          </section>

          <section className="card stack">
            <div className="row between">
              <h2>구성원 {data.members.length}명</h2>
              <span className="pill">위치 표시 {visibleMembers.length}명</span>
            </div>

            {data.members.map((member) => {
              const visible = visibleIds.has(member.id);
              const age = visible
                ? Math.max(0, Math.floor((
                    Date.parse(data.server_time) -
                    Date.parse(member.updated_at) +
                    elapsed
                  ) / 1000))
                : null;

              return (
                <button
                  className="member-row"
                  key={member.id}
                  disabled={!visible}
                  onClick={() => setFocus({
                    lat: member.lat,
                    lng: member.lng,
                    nonce: Date.now(),
                  })}
                >
                  <img src={avatarById(member.avatar).src} alt="" />
                  <span className="member-text">
                    <strong>
                      {member.name}{member.id === data.me.id ? ' · 나' : ''}
                      {member.id === data.group.owner_id ? ' · 그룹장' : ''}
                    </strong>
                    <small>
                      {visible
                        ? `${age}초 전 · 정확도 약 ${Math.round(member.accuracy)}m`
                        : '공유 꺼짐 또는 최신 위치 없음'}
                    </small>
                  </span>
                  {visible && <span>지도 보기</span>}
                </button>
              );
            })}
          </section>

          <section className="card stack">
            <h2>그룹 관리</h2>

            {owner ? (
              <>
                <p className="muted small">
                  새 초대를 발급하면 이전 링크가 무효가 됩니다.
                  새 초대는 24시간 동안 사용할 수 있습니다.
                </p>
                <button
                  disabled={busy}
                  onClick={() => void perform('invite')}
                >
                  새 초대 링크 발급
                </button>
              </>
            ) : (
              <p className="muted">그룹장이 초대 링크를 발급할 수 있습니다.</p>
            )}

            {inviteLink && (
              <>
                <label>
                  초대 링크
                  <input
                    value={inviteLink}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button className="secondary" onClick={copyInvite}>
                  링크 복사
                </button>
                <small className="muted break">
                  직접 입력용 코드: {inviteCode}
                </small>
              </>
            )}

            <button className="danger secondary" disabled={busy} onClick={leaveGroup}>
              그룹 나가기
            </button>
          </section>
        </>
      )}

      <ProfileForm
        key={`${data.me.id}:${data.me.name}:${data.me.avatar}`}
        me={data.me}
        busy={busy}
        onSave={(profile) => perform('profile', profile)}
      />

      {!data.group && (
        <section className="card stack">
          <h2>그룹 만들기 또는 참여하기</h2>
          <p className="muted small">
            참여하면 그룹에 닉네임과 캐릭터가 표시됩니다.
            위치는 별도로 공유를 시작해야 전송됩니다.
          </p>

          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void perform('create', { name: groupName });
            }}
          >
            <label>
              새 그룹 이름
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={30}
                required
              />
            </label>
            <button disabled={busy}>새 그룹 만들기</button>
          </form>

          <hr />

          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void perform('join', { code: normalizeInvite(joinCode) });
            }}
          >
            <label>
              초대 코드 또는 링크
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="받은 초대 링크를 붙여 넣으세요"
                required
              />
            </label>
            <button className="secondary" disabled={busy}>
              초대받은 그룹 참여
            </button>
          </form>
        </section>
      )}

      <footer className="muted small footer">
        위치 정확도와 갱신 속도는 기기·GPS·네트워크 상태에 따라 달라집니다.
        긴급 구조 서비스로 사용하지 마세요.
      </footer>
    </main>
  );
}

/* ---------- 루트 ---------- */

export default function App() {
  const [session, setSession] = useState(undefined);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!supabase) return;

    let alive = true;
    let receivedEvent = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        receivedEvent = true;
        if (alive) setSession(nextSession);
      }
    );

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setAuthError(errorText(error));
        if (!receivedEvent) setSession(data.session || null);
      })
      .catch((error) => {
        if (alive) {
          setAuthError(errorText(error));
          if (!receivedEvent) setSession(null);
        }
      });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) {
    return (
      <main className="shell">
        <section className="card">
          <h1>환경변수 설정이 필요합니다</h1>
          <p>Vercel에 Supabase URL과 공개용 키를 넣고 다시 배포하세요.</p>
        </section>
      </main>
    );
  }

  if (session === undefined) {
    return <main className="shell">로그인 상태 확인 중…</main>;
  }

  if (!session) {
    return (
      <>
        {authError && <p className="notice">{authError}</p>}
        <AuthPanel />
      </>
    );
  }

  return <Workspace key={session.user.id} session={session} />;
}
