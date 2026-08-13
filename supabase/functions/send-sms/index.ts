/**
 * Supabase Auth "Send SMS" 훅 → 솔라피(SOLAPI) 문자 발송.
 *
 * 호출하는 쪽이 사용자가 아니라 Supabase Auth(GoTrue)라서 JWT 가 없다.
 * 그래서 `--no-verify-jwt` 로 배포하고(= supabase/config.toml 의 verify_jwt = false),
 * 대신 요청이 진짜 Auth 에서 온 것인지 Standard Webhooks 서명으로 확인한다.
 *
 * 필요한 시크릿(`npx supabase secrets set ...`):
 * | 이름 | 필수 | 설명 |
 * | --- | --- | --- |
 * | `SOLAPI_API_KEY` | O | 솔라피 API 키 |
 * | `SOLAPI_API_SECRET` | O | 솔라피 API 시크릿 |
 * | `SOLAPI_SENDER` | O | 솔라피에 등록해 둔 발신번호 |
 * | `SEND_SMS_HOOK_SECRET` | 권장 | 대시보드에서 훅을 켤 때 나오는 `v1,whsec_...` |
 *
 * `SEND_SMS_HOOK_SECRET` 이 없으면 서명 검증을 건너뛴다 — 이 함수는 인증 없이
 * 열려 있는 상태이므로, 아무나 호출해서 우리 돈으로 문자를 뿌릴 수 있다.
 * 운영에서는 반드시 넣는다.
 */

const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send';

/** 서명된 요청을 재사용(replay)할 수 있는 시간. Standard Webhooks 권장값. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** 국내 휴대폰 번호: 010/011/016/017/018/019 + 7~8자리 (src/features/auth/phone.ts 와 동일) */
const PHONE_PATTERN = /^01[016789][0-9]{7,8}$/;

type SendSmsHookPayload = {
  user?: { phone?: string | null } | null;
  sms?: { otp?: string | null } | null;
};

/** Auth 훅이 기대하는 실패 응답 형식. */
function errorResponse(httpCode: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function encodeBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function hmacSha256(key: Uint8Array | string, message: string): Promise<ArrayBuffer> {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

/** 길이가 달라도 조기 종료하지 않는 비교. 서명 비교는 타이밍을 흘리면 안 된다. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < Math.max(aBytes.length, bBytes.length); i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Standard Webhooks 서명 검증. Supabase Auth 는 `webhook-id`, `webhook-timestamp`,
 * `webhook-signature` 헤더를 붙이고 `id.timestamp.body` 를 HMAC-SHA256 으로 서명한다.
 * 라이브러리를 쓰지 않는 이유: 이 정도 로직에 npm 의존성을 하나 더 끌고 오면
 * 콜드 스타트만 느려진다.
 */
async function isValidWebhookSignature(
  secret: string,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - sentAt);
  if (skewSeconds > WEBHOOK_TOLERANCE_SECONDS) return false;

  const base64Secret = secret.replace(/^v1,whsec_/, '');
  let expected: string;
  try {
    expected = encodeBase64(await hmacSha256(decodeBase64(base64Secret), `${id}.${timestamp}.${rawBody}`));
  } catch {
    // 시크릿이 base64 가 아니면(= 형식이 잘못 들어갔으면) 검증할 방법이 없다.
    return false;
  }

  // 키 회전 중에는 `v1,sig1 v1,sig2` 처럼 여러 서명이 올 수 있다.
  return signatureHeader
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => timingSafeEqual(part.slice('v1,'.length), expected));
}

/**
 * Auth 가 넘겨주는 번호는 `+` 없는 E.164(예: 821012345678)다.
 * 솔라피 국내 발송은 `01012345678` 형식을 받는다.
 */
function toKoreanLocalNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`;
  return PHONE_PATTERN.test(digits) ? digits : null;
}

/** 로그에 남길 때 남의 번호를 그대로 흘리지 않는다. 예: 010-1234-**** */
function maskNumber(digits: string): string {
  return digits.length < 8 ? '***' : `${digits.slice(0, digits.length - 4)}****`;
}

/** 솔라피 인증 헤더: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=HMAC(date+salt) */
async function solapiAuthorization(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const signature = toHex(await hmacSha256(apiSecret, date + salt));
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/** 90바이트(SMS)를 넘기면 LMS 로 넘어가 요금이 오른다. 짧게 유지한다. */
function otpMessage(otp: string): string {
  return `[핏루틴] 인증번호 ${otp}\n다른 사람에게 알려주지 마세요.`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'POST 만 허용한다');

  const apiKey = Deno.env.get('SOLAPI_API_KEY');
  const apiSecret = Deno.env.get('SOLAPI_API_SECRET');
  const sender = Deno.env.get('SOLAPI_SENDER')?.replace(/\D/g, '');
  if (!apiKey || !apiSecret || !sender) {
    console.error('SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER 시크릿이 설정되지 않았다');
    return errorResponse(500, 'SMS 발송 설정이 완료되지 않았다');
  }

  const rawBody = await req.text();

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  if (hookSecret) {
    if (!(await isValidWebhookSignature(hookSecret, req.headers, rawBody))) {
      console.warn('훅 서명 검증 실패 — 요청을 버린다');
      return errorResponse(401, '서명이 올바르지 않다');
    }
  } else {
    console.warn('SEND_SMS_HOOK_SECRET 이 없어 서명 검증을 건너뛴다 — 운영에서는 반드시 설정한다');
  }

  let payload: SendSmsHookPayload;
  try {
    payload = JSON.parse(rawBody) as SendSmsHookPayload;
  } catch {
    return errorResponse(400, '본문이 JSON 이 아니다');
  }

  const otp = payload.sms?.otp?.trim();
  const rawPhone = payload.user?.phone?.trim();
  if (!otp || !rawPhone) return errorResponse(400, 'user.phone 과 sms.otp 가 모두 필요하다');

  const to = toKoreanLocalNumber(rawPhone);
  if (!to) return errorResponse(400, '국내 휴대폰 번호가 아니다');

  let solapiResponse: Response;
  let body: Record<string, unknown>;
  try {
    solapiResponse = await fetch(SOLAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: await solapiAuthorization(apiKey, apiSecret),
      },
      body: JSON.stringify({ message: { to, from: sender, text: otpMessage(otp) } }),
    });
    body = (await solapiResponse.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (error) {
    // 네트워크 자체가 실패한 경우. 500 을 주면 Auth 가 사용자에게 실패를 알려 준다.
    console.error('솔라피 호출 실패', error);
    return errorResponse(500, '문자 발송에 실패했다');
  }

  const statusCode = typeof body.statusCode === 'string' ? body.statusCode : '';
  const statusMessage = typeof body.statusMessage === 'string' ? body.statusMessage : '';
  // 접수 성공은 2xxx(2000 = 정상 접수). 그 밖은 errorCode/errorMessage 로 온다.
  if (!solapiResponse.ok || !statusCode.startsWith('2')) {
    console.error('솔라피가 발송을 거절했다', {
      to: maskNumber(to),
      httpStatus: solapiResponse.status,
      statusCode,
      statusMessage,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
    });
    return errorResponse(502, '문자 발송에 실패했다');
  }

  console.log('인증번호 발송', { to: maskNumber(to), messageId: body.messageId });
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});
