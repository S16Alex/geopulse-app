import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api, supabase, stopWithKeepalive } from './supabase';
import { AVATARS, avatarById, STICKERS, stickerById } from './avatars';
import './styles.css';

function readPendingInvite() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('invite');

  if (code) {
    try {
      sessionStorage.setItem('gp_pending_invite', code);
    } catch {}
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

/* ---------- 인증 화면 ---------- */
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
          초대한 그룹끼리만 위치를 공유하고 가벼운 채팅과 이모티콘을 나눕니다.
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
        setData((previous) =>
          previous ? { ...previous, members: [] } : previous
        );
      } else {
        void pull();
      }
    }

    refreshRef.current = pull;
    void pull();

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
          : '위치 전송을 중지했습니다.'
      );
    }

    try {
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
          '새 위치 전송은 중단했습니다. 마지막 위치는 최대 45초 뒤 자동 만료됩니다.'
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
          await stop();
          if (mounted.current) {
            setStatus(`공유를 멈췄습니다: ${reason}`);
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

/* ---------- 네이버 지도 / 캐릭터 마커 + 채팅 말풍선 ---------- */
let naverPromise;

function loadNaver() {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (naverPromise) return naverPromise;

  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
  if (!clientId) {
    return Promise.reject(
      new Error('VITE_NAVER_MAP_CLIENT_ID를 설정하고 다시 배포해 주세요.')
    );
  }

  naverPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('네이버 지도 연결 시간이 초과되었습니다.'));
    }, 15000);

    window.__gpNaverReady = () => {
      clearTimeout(timeout);
      if (window.naver?.maps) resolve(window.naver.maps);
      else reject(new Error('네이버 지도 SDK를 초기화하지 못했습니다.'));
    };

    window.navermap_authFailure = () => {
      clearTimeout(timeout);
      reject(new Error('네이버 Client ID와 허용 도메인을 확인해 주세요.'));
    };

    const script = document.createElement('script');
    script.id = 'gp-naver-sdk';
    script.async = true;
    script.src =
      'https://oapi.map.naver.com/openapi/v3/maps.js' +
      `?ncpKeyId=${encodeURIComponent(clientId)}` +
      '&callback=__gpNaverReady';

    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('네이버 지도 스크립트를 불러오지 못했습니다.'));
    };

    document.head.appendChild(script);
  });

  return naverPromise;
}

function markerIcon(maps, member, isMe, bubbleText) {
  const root = document.createElement('div');
  root.style.cssText = 'width:120px;text-align:center;position:relative;';

  if (bubbleText) {
    const bubble = document.createElement('div');
    bubble.textContent = bubbleText;
    bubble.style.cssText = [
      'background:#fef08a',
      'color:#0f172a',
      'padding:4px 8px',
      'border-radius:12px',
      'font-size:11px',
      'font-weight:800',
      'margin-bottom:4px',
      'box-shadow:0 3px 8px rgba(0,0,0,0.35)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'border:1.5px solid #facc15',
    ].join(';');
    root.appendChild(bubble);
  }

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
    size: new maps.Size(120, bubbleText ? 114 : 88),
    anchor: new maps.Point(60, bubbleText ? 90 : 64),
  };
}

function LocationMap({ members, myId, focus, recentBubbles }) {
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
      const bubbleText = recentBubbles.get(member.id) || '';
      const signature = JSON.stringify([
        member.name,
        member.avatar,
        member.id === myId,
        bubbleText,
      ]);
      const existing = markers.current.get(member.id);

      if (existing) {
        existing.marker.setPosition(position);
        if (existing.signature !== signature) {
          existing.marker.setIcon(
            markerIcon(maps, member, member.id === myId, bubbleText)
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
            icon: markerIcon(maps, member, member.id === myId, bubbleText),
          }),
        });
      }
    });

    const me = members.find((member) => member.id === myId);
    if (me && !centered.current) {
      mapRef.current.setCenter(new maps.LatLng(me.lat, me.lng));
      centered.current = true;
    }
  }, [members, myId, ready, recentBubbles]);

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

/* ---------- 그룹 채팅 및 이모티콘 패널 ---------- */
function GroupChat({ messages, myId, busy, onSend }) {
  const [text, setText] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const current = text;
    setText('');
    await onSend({ content: current, sticker: null });
  }

  async function handleStickerClick(sticker) {
    setShowStickers(false);
    await onSend({ content: sticker.label, sticker: sticker.id });
  }

  return (
    <section className="card stack chat-card">
      <div className="row between">
        <h2>💬 그룹 채팅 · 이모티콘</h2>
        <span className="pill">최근 대화 {messages.length}건</span>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="muted small chat-empty">
            첫 인사나 귀여운 이모티콘을 보내보세요! (지도 위 캐릭터 머리 위에도 15초간 표시됩니다)
          </p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.user_id === myId;
            const sticker = stickerById(msg.sticker);
            return (
              <div
                key={msg.id}
                className={`chat-item ${isMine ? 'mine' : ''}`}
              >
                {!isMine && (
                  <img
                    className="chat-avatar"
                    src={avatarById(msg.avatar).src}
                    alt=""
                  />
                )}
                <div className="chat-bubble-wrap">
                  {!isMine && <small className="chat-sender">{msg.name}</small>}
                  <div className={`chat-bubble ${isMine ? 'mine' : ''}`}>
                    {sticker && (
                      <div className="chat-sticker">{sticker.emoji}</div>
                    )}
                    {msg.content && <span>{msg.content}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showStickers && (
        <div className="sticker-tray">
          {STICKERS.map((st) => (
            <button
              key={st.id}
              type="button"
              className="sticker-btn"
              disabled={busy}
              onClick={() => void handleStickerClick(st)}
            >
              <span className="sticker-emoji">{st.emoji}</span>
              <span className="sticker-label">{st.label}</span>
            </button>
          ))}
        </div>
      )}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <button
          type="button"
          className="secondary sticker-toggle"
          onClick={() => setShowStickers((prev) => !prev)}
          title="이모티콘 열기"
        >
          😊 이모티콘
        </button>
        <input
          placeholder="메시지를 입력하세요 (최대 200자)"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          전송
        </button>
      </form>
    </section>
  );
}

/* ---------- 로그인 후 메인 화면 (열고 닫는 사이드바 포함) ---------- */
function Workspace({ session }) {
  const { data, error, connection, refreshRef } = useGroupState();
  const gps = useForegroundLocation(session, refreshRef);
  const [now, setNow] = useState(performance.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // 사이드바 열림/닫힘 상태 및 탭('friends' | 'groups' | 'profile')
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('friends');

  const [groupName, setGroupName] = useState('우리 모임');
  const [joinCode, setJoinCode] = useState(INITIAL_INVITE);
  const [inviteCode, setInviteCode] = useState('');
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [focus, setFocus] = useState(null);

  // 프로필 수정 폼 상태
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('bunny');

  const groupId = data?.group?.id || null;
  const stop = gps.stop;

  useEffect(() => {
    if (data?.me) {
      setEditName(data.me.name);
      setEditAvatar(data.me.avatar);
    }
  }, [data?.me?.name, data?.me?.avatar]);

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

  async function perform(action, payload = {}, customNotice = '') {
    setBusy(true);
    setNotice('');

    try {
      const result = await api(action, payload);
      if (result?.invite_code) setInviteCode(result.invite_code);

      if (action === 'join') {
        try { sessionStorage.removeItem('gp_pending_invite'); } catch {}
        setJoinCode('');
      }
      if (action === 'leave' || action === 'switch_group') {
        setInviteCode('');
      }
      if (action === 'add_friend') {
        setFriendCodeInput('');
      }

      if (customNotice) {
        setNotice(customNotice);
      } else if (action === 'profile') {
        setNotice('프로필을 저장했습니다.');
      } else if (action === 'create' || action === 'join') {
        setNotice('그룹에 참여했습니다. 위치는 공유 시작을 눌러야 전송됩니다.');
      } else if (action === 'invite') {
        setNotice('새 초대를 발급했습니다. 이전 초대는 무효입니다.');
      }

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
    if (!window.confirm('현재 그룹에서 나가고 내 위치 공유를 종료할까요?')) return;
    await stop();
    await perform('leave', {}, '그룹에서 나왔습니다.');
  }

  async function switchGroup(targetGroupId) {
    if (targetGroupId === groupId) {
      setSidebarOpen(false);
      return;
    }
    await stop();
    await perform('switch_group', { group_id: targetGroupId }, '그룹을 전환했습니다.');
    setSidebarOpen(false);
  }

  const inviteLink = inviteCode
    ? `${window.location.origin}/#invite=${inviteCode}`
    : '';

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} 복사했습니다.`);
    } catch {
      setNotice(`자동 복사에 실패했습니다. 직접 복사해 주세요.`);
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

  const elapsed = Math.max(0, now - data._receivedAt) + data._rtt;

  const visibleMembers = data.members.filter((member) => (
    Number.isFinite(member.lat) &&
    Number.isFinite(member.lng) &&
    member.expires_at &&
    Date.parse(member.expires_at) - Date.parse(data.server_time) > elapsed
  ));

  const visibleIds = new Set(visibleMembers.map((member) => member.id));
  const friendIds = new Set((data.friends || []).map((f) => f.id));
  const owner = data.group?.owner_id === data.me.id;

  // 최근 15초 이내 채팅/이모티콘을 지도 캐릭터 위 말풍선으로 표시
  const recentBubbles = new Map();
  (data.messages || []).forEach((msg) => {
    const ageMs =
      Date.parse(data.server_time) - Date.parse(msg.created_at) + elapsed;
    if (ageMs <= 15000) {
      const st = stickerById(msg.sticker);
      const display = st
        ? `${st.emoji} ${msg.content || st.label}`
        : msg.content;
      recentBubbles.set(msg.user_id, display);
    }
  });

  return (
    <div className="app-layout">
      {/* 모바일/태블릿 사이드바 배경 오버레이 */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 열고 닫을 수 있는 카카오톡 스타일 사이드바 */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="row">
            <img
              className="sidebar-my-avatar"
              src={avatarById(data.me.avatar).src}
              alt=""
            />
            <div>
              <strong className="sidebar-my-name">{data.me.name}</strong>
              <div className="muted small">
                내 코드: <b>{data.me.friend_code}</b>{' '}
                <button
                  type="button"
                  className="inline-btn"
                  onClick={() => void copyText(data.me.friend_code, '내 친구 코드를')}
                >
                  복사
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="secondary icon-btn"
            onClick={() => setSidebarOpen(false)}
            title="사이드바 닫기"
          >
            ✕ 닫기
          </button>
        </div>

        {/* 사이드바 상단 탭 */}
        <div className="sidebar-tabs">
          <button
            type="button"
            className={`tab-btn ${sidebarTab === 'friends' ? 'active' : ''}`}
            onClick={() => setSidebarTab('friends')}
          >
            👥 친구 ({(data.friends || []).length})
          </button>
          <button
            type="button"
            className={`tab-btn ${sidebarTab === 'groups' ? 'active' : ''}`}
            onClick={() => setSidebarTab('groups')}
          >
            💬 그룹 ({(data.groups || []).length})
          </button>
          <button
            type="button"
            className={`tab-btn ${sidebarTab === 'profile' ? 'active' : ''}`}
            onClick={() => setSidebarTab('profile')}
          >
            ⚙️ 내 정보
          </button>
        </div>

        <div className="sidebar-body">
          {/* 탭 1: 친구 목록 및 친구 추가 */}
          {sidebarTab === 'friends' && (
            <div className="stack">
              <form
                className="stack sidebar-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(
                    'add_friend',
                    { code: friendCodeInput },
                    '친구를 추가했습니다!'
                  );
                }}
              >
                <label>
                  친구 코드로 추가
                  <div className="row" style={{ marginTop: '6px' }}>
                    <input
                      style={{ marginTop: 0 }}
                      placeholder="8자리 코드 입력"
                      value={friendCodeInput}
                      maxLength={8}
                      onChange={(e) => setFriendCodeInput(e.target.value)}
                      required
                    />
                    <button type="submit" disabled={busy}>추가</button>
                  </div>
                </label>
              </form>

              <div className="stack">
                <h3 className="sidebar-subtitle">내 친구 목록</h3>
                {(data.friends || []).length === 0 ? (
                  <p className="muted small">
                    아직 등록된 친구가 없습니다. 친구 코드를 입력하거나 아래 그룹 멤버에서 바로 추가해 보세요.
                  </p>
                ) : (
                  (data.friends || []).map((fr) => (
                    <div key={fr.id} className="sidebar-item">
                      <img src={avatarById(fr.avatar).src} alt="" />
                      <div className="member-text">
                        <strong>{fr.name}</strong>
                        <small>
                          {fr.is_sharing
                            ? '🟢 현재 그룹에서 위치 공유 중'
                            : `코드: ${fr.friend_code}`}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="danger secondary small-btn"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            'remove_friend',
                            { target_id: fr.id },
                            '친구를 삭제했습니다.'
                          )
                        }
                      >
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>

              {data.members.filter((m) => m.id !== data.me.id && !friendIds.has(m.id)).length > 0 && (
                <div className="stack">
                  <h3 className="sidebar-subtitle">같은 그룹 멤버 친구 추가</h3>
                  {data.members
                    .filter((m) => m.id !== data.me.id && !friendIds.has(m.id))
                    .map((m) => (
                      <div key={m.id} className="sidebar-item">
                        <img src={avatarById(m.avatar).src} alt="" />
                        <div className="member-text">
                          <strong>{m.name}</strong>
                          <small>현재 그룹 멤버</small>
                        </div>
                        <button
                          type="button"
                          className="small-btn"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              'add_friend',
                              { target_id: m.id },
                              `${m.name}님을 친구로 추가했습니다!`
                            )
                          }
                        >
                          + 친구
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 탭 2: 그룹 목록 및 전환/생성/참여 */}
          {sidebarTab === 'groups' && (
            <div className="stack">
              <div className="stack">
                <h3 className="sidebar-subtitle">내 그룹 목록 (클릭 시 전환)</h3>
                {(data.groups || []).length === 0 ? (
                  <p className="muted small">참여 중인 그룹이 없습니다.</p>
                ) : (
                  (data.groups || []).map((gr) => {
                    const isCurrent = gr.id === groupId;
                    return (
                      <button
                        key={gr.id}
                        type="button"
                        className={`sidebar-item group-item ${isCurrent ? 'current' : ''}`}
                        onClick={() => void switchGroup(gr.id)}
                      >
                        <div className="member-text">
                          <strong>
                            💬 {gr.name}
                            {gr.owner_id === data.me.id ? ' (그룹장)' : ''}
                          </strong>
                          <small>멤버 {gr.member_count}명</small>
                        </div>
                        <span className="pill">
                          {isCurrent ? '현재 활성' : '전환'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <hr />

              <form
                className="stack sidebar-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform('create', { name: groupName });
                }}
              >
                <h3 className="sidebar-subtitle">새 그룹 만들기</h3>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="그룹 이름 (1~30자)"
                  maxLength={30}
                  required
                />
                <button disabled={busy}>새 그룹 생성</button>
              </form>

              <form
                className="stack sidebar-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform('join', { code: normalizeInvite(joinCode) });
                }}
              >
                <h3 className="sidebar-subtitle">초대 코드로 그룹 추가 참여</h3>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="초대 링크 또는 코드 붙여넣기"
                  required
                />
                <button className="secondary" disabled={busy}>
                  그룹 참여하기
                </button>
              </form>
            </div>
          )}

          {/* 탭 3: 내 프로필 수정 */}
          {sidebarTab === 'profile' && (
            <form
              className="stack sidebar-box"
              onSubmit={(e) => {
                e.preventDefault();
                void perform('profile', { name: editName, avatar: editAvatar });
              }}
            >
              <h3 className="sidebar-subtitle">내 캐릭터와 닉네임 변경</h3>
              <label>
                닉네임
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={20}
                  required
                />
              </label>

              <div className="avatar-picker">
                {AVATARS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`avatar-option ${editAvatar === item.id ? 'selected' : ''}`}
                    onClick={() => setEditAvatar(item.id)}
                  >
                    <img src={item.src} alt="" />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <button disabled={busy}>프로필 저장</button>
            </form>
          )}
        </div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <main className="shell">
        <header className="app-header">
          <div className="row">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              ☰ 친구·그룹
            </button>
            <div>
              <div className="brand">GeoPulse</div>
              <div className="muted">
                {data.group ? `현재 그룹: ${data.group.name}` : '그룹을 선택하거나 만들어 주세요'}
              </div>
            </div>
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

        {data.group ? (
          <>
            <LocationMap
              members={visibleMembers}
              myId={data.me.id}
              focus={focus}
              recentBubbles={recentBubbles}
            />

            {/* 실시간 그룹 채팅 및 이모티콘 */}
            <GroupChat
              messages={data.messages || []}
              myId={data.me.id}
              busy={busy}
              onSend={(payload) => perform('chat', payload)}
            />

            <section className="card stack">
              <div className="row between">
                <h2>📍 내 위치 공유</h2>
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
                  내 정밀 위치를 현재 그룹({data.group.name}) 구성원에게 공유하는 데 동의합니다.
                </span>
              </label>

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
                <h2>그룹 구성원 {data.members.length}명</h2>
                <span className="pill">지도 표시 {visibleMembers.length}명</span>
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
                  <div className="member-row" key={member.id}>
                    <img src={avatarById(member.avatar).src} alt="" />
                    <span className="member-text">
                      <strong>
                        {member.name}{member.id === data.me.id ? ' · 나' : ''}
                        {member.id === data.group.owner_id ? ' · 그룹장' : ''}
                      </strong>
                      <small>
                        {visible
                          ? `${age}초 전 · 정확도 약 ${Math.round(member.accuracy)}m`
                          : '위치 공유 꺼짐'}
                      </small>
                    </span>
                    <div className="row">
                      {member.id !== data.me.id && !friendIds.has(member.id) && (
                        <button
                          type="button"
                          className="secondary small-btn"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              'add_friend',
                              { target_id: member.id },
                              `${member.name}님을 친구로 추가했습니다!`
                            )
                          }
                        >
                          + 친구
                        </button>
                      )}
                      {visible && (
                        <button
                          type="button"
                          className="small-btn"
                          onClick={() =>
                            setFocus({
                              lat: member.lat,
                              lng: member.lng,
                              nonce: Date.now(),
                            })
                          }
                        >
                          지도 보기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="card stack">
              <h2>그룹 초대 및 관리</h2>
              {owner ? (
                <button
                  disabled={busy}
                  onClick={() => void perform('invite')}
                >
                  새 초대 링크 발급 (24시간 유효)
                </button>
              ) : (
                <p className="muted small">그룹장이 초대 링크를 발급할 수 있습니다.</p>
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
                  <button
                    className="secondary"
                    onClick={() => void copyText(inviteLink, '초대 링크를')}
                  >
                    초대 링크 복사
                  </button>
                </>
              )}

              <button
                className="danger secondary"
                disabled={busy}
                onClick={leaveGroup}
              >
                이 그룹 나가기
              </button>
            </section>
          </>
        ) : (
          <section className="card stack">
            <h2>시작하기: 그룹을 만들거나 참여하세요</h2>
            <p className="muted small">
              좌측 상단 <b>[☰ 친구·그룹]</b> 버튼을 눌러 언제든 친구 목록과 여러 그룹을 관리할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setSidebarTab('groups');
                setSidebarOpen(true);
              }}
            >
              사이드바 열어서 그룹 만들기 / 참여하기
            </button>
          </section>
        )}

        <footer className="muted small footer">
          위치 정확도와 갱신 속도는 기기·GPS·네트워크 상태에 따라 달라집니다.
        </footer>
      </main>
    </div>
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
