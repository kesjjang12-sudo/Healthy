/**
 * Supabase Auth 의 "Send SMS Hook" 구현체. 인증번호 문자를 솔라피로 보낸다.
 *
 * 왜 이게 필요한가. Supabase 가 기본으로 붙여주는 SMS 업체는 Twilio,
 * MessageBird, Vonage, TextLocal 넷뿐이고 솔라피는 없다. 대신 Send SMS Hook
 * 이 있어서, 문자를 보내는 순간을 통째로 가로채 원하는 업체로 돌릴 수 있다.
 * OTP 자체는 Supabase 가 만들고 검증한다 — 이 함수는 "만들어진 번호를
 * 전달만" 한다. 그래서 인증 로직을 우리가 다시 짤 필요가 없다.
 *
 * 흐름:
 *   앱에서 signInWithOtp({phone})
 *     → Supabase 가 OTP 생성
 *     → 이 함수를 호출(웹훅)
 *     → 솔라피 API 로 문자 발송
 *     → 사용자가 앱에 번호 입력 → Supabase 가 verifyOtp 로 검증
 *
 * 필요한 시크릿 (supabase secrets set 으로 넣는다. 코드에 절대 적지 말 것):
 *   SEND_SMS_HOOK_SECRET  대시보드가 발급하는 훅 서명 키(v1,whsec_... 형태)
 *   SOLAPI_API_KEY        솔라피 API Key
 *   SOLAPI_API_SECRET     솔라피 API Secret
 *   SOLAPI_SENDER         발신번호. 솔라피에 사전 등록된 번호여야 한다(법령).
 */
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const SOLAPI_SEND_URL = 'https://api.solapi.com/messages/v4/send';

/**
 * 솔라피 인증 헤더.
 *
 *   Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=...
 *
 * signature 는 (date + salt) 를 API Secret 키로 HMAC-SHA256 한 hex 값이다.
 * date 가 표준시와 ±15분 넘게 벌어지면 RequestTimeTooSkewed 로 거절된다.
 */
async function solapiAuthHeader(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString();
  // salt 는 12~64바이트의 불규칙한 문자열이어야 한다.
  const salt = crypto.randomUUID().replace(/-/g, '');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(date + salt),
  );

  const signature = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/**
 * 훅이 주는 번호는 E.164 에서 + 가 빠진 형태(821012345678)다.
 * 솔라피는 국내 표기(01012345678)를 쓴다.
 */
function toKoreanLocalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('82') ? `0${digits.slice(2)}` : digits;
}

/** Deno.serve 와 분리해 둔다 — 그래야 테스트에서 직접 호출할 수 있다. */
export async function handleSendSms(request: Request): Promise<Response> {
  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const apiKey = Deno.env.get('SOLAPI_API_KEY');
  const apiSecret = Deno.env.get('SOLAPI_API_SECRET');
  const sender = Deno.env.get('SOLAPI_SENDER');

  if (!hookSecret || !apiKey || !apiSecret || !sender) {
    // 설정이 빠진 걸 성공으로 넘기면 "문자가 안 오는데 오류도 없는" 상태가
    // 된다. 그건 디버깅이 가장 어려운 실패다.
    console.error('필수 시크릿이 비어 있습니다.');
    return new Response(JSON.stringify({ error: { message: 'SMS 설정이 완료되지 않았습니다.' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await request.text();

  // 서명 검증. 이걸 빼면 훅 주소를 아는 누구나 아무 번호로 문자를 쏠 수 있다
  // (요금이 우리 쪽으로 나간다).
  let event: { user: { phone: string }; sms: { otp: string } };
  try {
    const headers = Object.fromEntries(request.headers);
    // 대시보드는 base64 앞에 v1,whsec_ 를 붙여서 보여준다. 라이브러리는 그
    // 접두사 없는 값을 받는다.
    const webhook = new Webhook(hookSecret.replace('v1,whsec_', ''));
    event = webhook.verify(payload, headers) as typeof event;
  } catch (error) {
    console.error('훅 서명 검증 실패', error);
    return new Response(JSON.stringify({ error: { message: '서명이 올바르지 않습니다.' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const response = await fetch(SOLAPI_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await solapiAuthHeader(apiKey, apiSecret),
    },
    body: JSON.stringify({
      message: {
        to: toKoreanLocalNumber(event.user.phone),
        from: sender,
        text: `[핏루틴] 인증번호 ${event.sms.otp} 를 입력해 주세요.`,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('솔라피 발송 실패', response.status, detail);
    // 훅이 오류를 돌려주면 Supabase 가 signInWithOtp 를 실패로 처리한다.
    // 앱은 "잠시 후 다시 시도해 주세요"를 띄운다 — 문자가 안 온 채로
    // "보냈습니다" 화면에 갇히는 것보다 낫다.
    return new Response(JSON.stringify({ error: { message: '문자를 보내지 못했습니다.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 테스트로 불러올 때는 서버를 띄우지 않는다.
if (import.meta.main) {
  Deno.serve(handleSendSms);
}
