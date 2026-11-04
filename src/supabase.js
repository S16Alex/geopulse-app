import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

export const PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const supabase =
  SUPABASE_URL && PUBLIC_KEY
    ? createClient(SUPABASE_URL, PUBLIC_KEY)
    : null;

export async function api(action, payload = {}) {
  if (!supabase) {
    throw new Error('Supabase 환경변수를 설정해 주세요.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const { data, error } = await supabase
      .rpc('gp_action', {
        p_action: action,
        p_data: payload,
      })
      .abortSignal(controller.signal);

    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// 페이지가 숨겨질 때 사용하는 최선 노력 방식의 종료 요청입니다.
// 브라우저 종료 시 전달을 보장하지 않으므로 서버 만료 처리도 병행합니다.
export async function stopWithKeepalive(sessionId, accessToken) {
  if (!accessToken) throw new Error('로그인 정보가 없습니다.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gp_action`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: PUBLIC_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_action: 'stop',
      p_data: { session: sessionId },
    }),
  });

  if (!response.ok) {
    throw new Error('서버에 공유 중지 요청을 전달하지 못했습니다.');
  }
}
