import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { api, supabase, stopWithKeepalive } from './supabase';
import { AVATARS, EMOTICONS, avatarById, emoticonById } from './avatars';
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

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
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
        <h1>우리 위치와 대화를 한곳에서</h1>
        <p className="muted">
          친구·그룹 목록을 관리하고, 귀여운 캐릭터로 실시간 위치와 이모티콘 채팅을 주고받으세요.
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
          : '위치 전송을 중지했습니다. 서버에 중지를 전달하고 있습니다.'
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

function markerIcon(maps, member, isMe, latestChat) {
  const root = document.createElement('div');
  root.style.cssText = 'width:124px;text-align:center;position:relative;';

  if (latestChat) {
    const bubble = document.createElement('div');
    bubble.style.cssText = [
      'background:#ffffff',
      'color:#0f172a',
      'border:2px solid #059669',
      'border-radius:12px',
      'padding:4px 8px',
      'font-size:11px',
      'font-weight:700',
      'margin-bottom:4px',
      'box-shadow:0 3px 10px rgba(0,0,0,0.35)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');

    const emo = latestChat.emoticon ? emoticonById(latestChat.emoticon) : null;
    bubble.textContent =
      (emo ? `${emo.emoji} ` : '') +
      (latestChat.message || (emo ? emo.label : ''));
    root.append(bubble);
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
    size: new maps.Size(124, latestChat ? 114 : 88),
    anchor: new maps.Point(62, latestChat ? 90 : 64),
  };
}

function LocationMap({ members, messages, myId, focus }) {
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

    // 각 구성원의 가장 최근 메시지 추출
    const latestByUser = new Map();
    (messages || []).forEach((msg) => {
      latestByUser.set(msg.user_id, msg);
    });

    markers.current.forEach(({ marker }, id) => {
      if (!present.has(id)) {
        marker.setMap(null);
        markers.current.delete(id);
      }
    });

    members.forEach((member) => {
      const position = new maps.LatLng(member.lat, member.lng);
      const latestChat = latestByUser.get(member.id) || null;
      const signature = JSON.stringify([
        member.name,
        member.avatar,
        member.id === myId,
        latestChat?.id || null,
      ]);
      const existing = markers.current.get(member.id);

      if (existing) {
        existing.marker.setPosition(position);
        if (existing.signature !== signature) {
          existing.marker.setIcon(
            markerIcon(maps, member, member.id === myId, latestChat)
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
            icon: markerIcon(maps, member, member.id === myId, latestChat),
          }),
        });
      }
    });

    const me = members.find((member) => member.id === myId);
    if (me && !centered.current) {
      mapRef.current.setCenter(new maps.LatLng(me.lat, me.lng));
      centered.current = true;
    }
  }, [members, messages, myId, ready]);

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
function ChatPanel({ messages, myId, busy, onSend }) {
  const [text, setText] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages?.length]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await onSend({ message: trimmed, emoticon: null });
  }

  async function handleSticker(emoId) {
    setShowStickers(false);
    await onSend({ message: text.trim(), emoticon: emoId });
    setText('');
  }

  return (
    <section className="card chat-card stack">
      <div className="row between">
        <h2>그룹 실시간 톡</h2>
        <span className="pill">최근 대화 {(messages || []).length}건</span>
      </div>

      <div className="chat-list" ref={listRef}>
        {(!messages || messages.length === 0) ? (
          <p className="muted small center-text">
            아직 대화가 없습니다. 첫 인사나 이모티콘을 보내보세요!
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === myId;
            const emo = msg.emoticon ? emoticonById(msg.emoticon) : null;
            return (
              <div
                key={msg.id}
                className={`chat-item ${isMe ? 'chat-mine' : 'chat-other'}`}
              >
                {!isMe && (
                  <img
                    className="chat-avatar"
                    src={avatarById(msg.avatar).src}
                    alt=""
                  />
                )}
                <div className="chat-bubble-wrap">
                  {!isMe && <span className="chat-sender">{msg.name}</span>}
                  <div className="chat-bubble">
                    {emo && (
                      <img
                        className="chat-sticker"
                        src={emo.src}
                        alt={emo.label}
                      />
                    )}
                    {msg.message && <p>{msg.message}</p>}
                  </div>
                  <small className="chat-time">{formatTime(msg.created_at)}</small>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showStickers && (
        <div className="sticker-picker">
          {EMOTICONS.map((emo) => (
            <button
              key={emo.id}
              type="button"
              className="sticker-btn"
              disabled={busy}
              onClick={() => void handleSticker(emo.id)}
            >
              <img src={emo.src} alt={emo.label} />
            </button>
          ))}
        </div>
      )}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <button
          type="button"
          className="secondary sticker-toggle"
          onClick={() => setShowStickers((prev) => !prev)}
        >
          😊 이모티콘
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요 (최대 200자)"
          maxLength={200}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          전송
        </button>
      </form>
    </section>
  );
}

/* ---------- 프로필 수정 ---------- */
function ProfileForm({ me, busy, onSave }) {
  const [name, setName] = useState(me.name);
  const [statusMessage, setStatusMessage] = useState(me.status_message || '');
  const [avatar, setAvatar] = useState(me.avatar);

  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ name, avatar, status_message: statusMessage });
      }}
    >
      <h2>내 프로필 설정</h2>

      <label>
        닉네임
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          required
        />
      </label>

      <label>
        상태메시지 (친구·그룹 목록에 표시)
        <input
          value={statusMessage}
          onChange={(e) => setStatusMessage(e.target.value)}
          placeholder="예: 지금 강남역 가는 중!"
          maxLength={40}
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

/* ---------- 로그인 후 메인 화면 (사이드바 + 워크스페이스) ---------- */
function Workspace({ session }) {
  const { data, error, connection, refreshRef } = useGroupState();
  const gps = useForegroundLocation(session, refreshRef);
  const [now, setNow] = useState(performance.now());
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'friends' | 'groups' | 'profile'
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [groupName, setGroupName] = useState('우리 모임');
  const [joinCode, setJoinCode] = useState(INITIAL_INVITE);
  const [friendCodeInput, setFriendCodeInput] = useState('');
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

  async function perform(action, payload = {}, customNotice = '') {
    setBusy(true);
    setNotice('');

    try {
      const result = await api(action, payload);
      if (result?.invite_code) setInviteCode(result.invite_code);
      if (action === 'join') {
        try { sessionStorage.removeItem('gp_pending_invite'); } catch {}
        setJoinCode('');
        setActiveTab('map');
      }
      if (action === 'create') {
        setActiveTab('map');
      }
      if (action === 'switch_group') {
        setInviteCode('');
        setActiveTab('map');
      }
      if (action === 'leave') setInviteCode('');

      if (action !== 'chat') {
        setNotice(
          customNotice ||
          (action === 'profile'
            ? '프로필을 저장했습니다.'
            : action === 'create' || action === 'join'
              ? '그룹에 입장했습니다. 위치는 공유 시작을 눌러야 전송됩니다.'
              : action === 'invite'
                ? '새 초대를 발급했습니다. 이전 초대는 무효입니다.'
                : action === 'add_friend'
                  ? '친구 목록에 추가했습니다.'
                  : action === 'remove_friend'
                    ? '친구 목록에서 삭제했습니다.'
                    : '처리했습니다.')
        );
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

  async function leaveGroup(targetGroupId) {
    if (!window.confirm('이 그룹에서 나가고 내 위치 공유를 종료할까요?')) return;
    await stop();
    await perform('leave', { group_id: targetGroupId });
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
          <h1>그룹 및 친구 정보를 불러오는 중…</h1>
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

  const visibleMembers = (data.members || []).filter((member) => (
    Number.isFinite(member.lat) &&
    Number.isFinite(member.lng) &&
    member.expires_at &&
    Date.parse(member.expires_at) - Date.parse(data.server_time) > elapsed
  ));

  const visibleIds = new Set(visibleMembers.map((member) => member.id));
  const owner = data.group?.owner_id === data.me.id;
  const groups = data.groups || [];
  const friends = data.friends || [];
  const messages = data.messages || [];

  return (
    <div className="app-layout">
      {/* ---------- 왼쪽 메신저형 사이드바 ---------- */}
      <aside className="messenger-sidebar">
        <div className="sidebar-header">
          <div>
            <div className="brand">GeoPulse</div>
            <div className="muted small">{data.group?.name || '그룹 미선택'}</div>
          </div>
          <button className="secondary small-btn" onClick={logout} disabled={busy}>
            로그아웃
          </button>
        </div>

        {/* 내 미니 프로필 카드 */}
        <div className="my-mini-card">
          <img src={avatarById(data.me.avatar).src} alt="" />
          <div className="member-text">
            <strong>{data.me.name}</strong>
            <small>{data.me.status_message || '상태메시지가 없습니다.'}</small>
            <small className="code-badge">
              내 친구코드: <b>{data.me.friend_code}</b>
              <button
                type="button"
                className="inline-copy"
                onClick={() => void copyText(data.me.friend_code, '내 친구 코드를')}
              >
                복사
              </button>
            </small>
          </div>
        </div>

        {/* 네비게이션 탭 버튼 */}
        <nav className="sidebar-tabs">
          <button
            type="button"
            className={activeTab === 'map' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('map')}
          >
            🗺️ 지도·톡
          </button>
          <button
            type="button"
            className={activeTab === 'friends' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('friends')}
          >
            👤 친구 ({friends.length})
          </button>
          <button
            type="button"
            className={activeTab === 'groups' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('groups')}
          >
            💬 그룹 ({groups.length})
          </button>
          <button
            type="button"
            className={activeTab === 'profile' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('profile')}
          >
            ⚙️ 내 정보
          </button>
        </nav>

        {/* 사이드바 내부 리스트 (PC에서는 항상 표시 / 모바일에서는 선택 탭 표시) */}
        <div className="sidebar-body">
          {/* 1) 친구 목록 패널 */}
          <div className={activeTab === 'friends' ? 'panel-section show' : 'panel-section'}>
            <div className="section-title">친구 추가</div>
            <form
              className="compact-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!friendCodeInput.trim()) return;
                void perform('add_friend', { code: friendCodeInput.trim() });
                setFriendCodeInput('');
              }}
            >
              <input
                value={friendCodeInput}
                onChange={(e) => setFriendCodeInput(e.target.value)}
                placeholder="친구의 8자리 코드 입력"
                maxLength={16}
              />
              <button type="submit" disabled={busy}>추가</button>
            </form>

            <div className="section-title">내 친구 목록 ({friends.length}명)</div>
            {friends.length === 0 ? (
              <p className="muted small">
                아직 등록된 친구가 없습니다. 친구 코드를 입력하거나 그룹원 목록에서 [+ 친구]를 눌러보세요!
              </p>
            ) : (
              <div className="stack-tight">
                {friends.map((fr) => (
                  <div className="messenger-row" key={fr.id}>
                    <img src={avatarById(fr.avatar).src} alt="" />
                    <div className="member-text">
                      <strong>
                        {fr.name}
                        {fr.is_sharing && <span className="online-dot"> ● 공유 중</span>}
                      </strong>
                      <small>{fr.status_message || '상태메시지 없음'}</small>
                    </div>
                    <button
                      type="button"
                      className="secondary tiny-btn"
                      disabled={busy}
                      onClick={() => void perform('remove_friend', { friend_id: fr.id })}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2) 그룹 목록 패널 */}
          <div className={activeTab === 'groups' ? 'panel-section show' : 'panel-section'}>
            <div className="section-title">내 그룹 목록 ({groups.length})</div>
            {groups.length === 0 ? (
              <p className="muted small">참여 중인 그룹이 없습니다. 아래에서 새 그룹을 만들거나 초대 코드로 참여하세요.</p>
            ) : (
              <div className="stack-tight">
                {groups.map((grp) => (
                  <div
                    key={grp.id}
                    className={`messenger-row ${grp.is_active ? 'active-group-row' : ''}`}
                  >
                    <div className="group-icon">👥</div>
                    <div className="member-text">
                      <strong>
                        {grp.name}
                        {grp.is_active && <span className="online-dot"> · 현재 선택됨</span>}
                      </strong>
                      <small>구성원 {grp.member_count}명</small>
                    </div>
                    {!grp.is_active ? (
                      <button
                        type="button"
                        className="tiny-btn"
                        disabled={busy}
                        onClick={async () => {
                          await stop();
                          await perform('switch_group', { group_id: grp.id }, `'${grp.name}' 그룹으로 전환했습니다.`);
                        }}
                      >
                        입장
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="danger secondary tiny-btn"
                        disabled={busy}
                        onClick={() => void leaveGroup(grp.id)}
                      >
                        나가기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <hr />

            <div className="section-title">새 그룹 만들기</div>
            <form
              className="stack-tight"
              onSubmit={(e) => {
                e.preventDefault();
                void perform('create', { name: groupName });
              }}
            >
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="새 그룹 이름 (1~30자)"
                maxLength={30}
                required
              />
              <button disabled={busy}>새 그룹 만들기</button>
            </form>

            <div className="section-title">초대 코드로 그룹 참여</div>
            <form
              className="stack-tight"
              onSubmit={(e) => {
                e.preventDefault();
                void perform('join', { code: normalizeInvite(joinCode) });
              }}
            >
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="초대 링크 또는 코드 붙여넣기"
                required
              />
              <button className="secondary" disabled={busy}>
                초대받은 그룹 참여
              </button>
            </form>
          </div>

          {/* 3) 내 프로필 설정 패널 */}
          <div className={activeTab === 'profile' ? 'panel-section show' : 'panel-section'}>
            <ProfileForm
              key={`${data.me.id}:${data.me.name}:${data.me.avatar}:${data.me.status_message}`}
              me={data.me}
              busy={busy}
              onSave={(profile) => perform('profile', profile)}
            />
          </div>
        </div>
      </aside>

      {/* ---------- 오른쪽 메인 화면 (지도 + 위치 공유 + 그룹 채팅 + 그룹원) ---------- */}
      <main className="main-content">
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && (
          <p className="notice warning" role="alert">
            서버 통신 확인 필요: {error}
          </p>
        )}

        {!data.group ? (
          <section className="card stack">
            <h2>그룹을 선택하거나 새로 만들어 주세요</h2>
            <p className="muted small">
              왼쪽 사이드바(모바일은 [그룹] 탭)에서 그룹을 만들거나 초대 코드로 참여하면 지도와 실시간 채팅이 활성화됩니다.
            </p>
            <button onClick={() => setActiveTab('groups')}>
              그룹 목록 / 만들기로 이동
            </button>
          </section>
        ) : (
          <div className={activeTab === 'map' ? 'map-workspace show' : 'map-workspace'}>
            <LocationMap
              members={visibleMembers}
              messages={messages}
              myId={data.me.id}
              focus={focus}
            />

            <div className="workspace-grid">
              {/* 실시간 그룹 채팅 및 이모티콘 */}
              <ChatPanel
                messages={messages}
                myId={data.me.id}
                busy={busy}
                onSend={(chatPayload) => perform('chat', chatPayload)}
              />

              <div className="stack">
                {/* 내 위치 공유 스위치 카드 */}
                <section className="card stack">
                  <div className="row between">
                    <h2>내 위치 공유 ({data.group.name})</h2>
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

                {/* 현재 그룹 구성원 및 친구 추가 카드 */}
                <section className="card stack">
                  <div className="row between">
                    <h2>그룹 구성원 {(data.members || []).length}명</h2>
                    <span className="pill">지도 표시 {visibleMembers.length}명</span>
                  </div>

                  {(data.members || []).map((member) => {
                    const visible = visibleIds.has(member.id);
                    const isMe = member.id === data.me.id;
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
                            {member.name}{isMe ? ' · 나' : ''}
                            {member.id === data.group.owner_id ? ' · 그룹장' : ''}
                          </strong>
                          {member.status_message && (
                            <small className="status-quote">"{member.status_message}"</small>
                          )}
                          <small>
                            {visible
                              ? `${age}초 전 · 정확도 약 ${Math.round(member.accuracy)}m`
                              : '공유 꺼짐 또는 최신 위치 없음'}
                          </small>
                        </span>

                        <div className="row">
                          {visible && (
                            <button
                              type="button"
                              className="tiny-btn"
                              onClick={() => setFocus({
                                lat: member.lat,
                                lng: member.lng,
                                nonce: Date.now(),
                              })}
                            >
                              지도 보기
                            </button>
                          )}
                          {!isMe && !member.is_friend && (
                            <button
                              type="button"
                              className="secondary tiny-btn"
                              disabled={busy}
                              onClick={() => void perform('add_friend', { friend_id: member.id })}
                            >
                              + 친구
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 초대 링크 발급 */}
                  <div className="invite-box stack-tight">
                    {owner ? (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void perform('invite')}
                      >
                        🔗 그룹 초대 링크·코드 발급
                      </button>
                    ) : (
                      <small className="muted">그룹장이 초대 링크를 발급할 수 있습니다.</small>
                    )}

                    {inviteLink && (
                      <div className="stack-tight">
                        <input
                          value={inviteLink}
                          readOnly
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          type="button"
                          onClick={() => void copyText(inviteLink, '초대 링크를')}
                        >
                          초대 링크 복사
                        </button>
                        <small className="muted break">직접 입력 코드: {inviteCode}</small>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        <footer className="muted small footer">
          위치 정확도와 갱신 속도는 기기·GPS·네트워크 상태에 따라 달라집니다. 긴급 구조 서비스로 사용하지 마세요.
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
