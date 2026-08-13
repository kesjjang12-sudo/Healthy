/**
 * 훅 핸들러 검증. 실제 솔라피로는 쏘지 않고 fetch 를 가로채서, 우리가 만든
 * 인증 헤더와 본문이 규격대로인지만 본다. 여기서 틀리면 운영에서는 문자가
 * 조용히 안 가고 로그만 남는다 — 그전에 잡는 게 목적이다.
 */
import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const HOOK_SECRET_RAW = 'c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5LTEyMzQ1Ng==';

Deno.env.set('SEND_SMS_HOOK_SECRET', `v1,whsec_${HOOK_SECRET_RAW}`);
Deno.env.set('SOLAPI_API_KEY', 'TESTKEY123');
Deno.env.set('SOLAPI_API_SECRET', 'TESTSECRET456');
Deno.env.set('SOLAPI_SENDER', '0212345678');

const { handleSendSms } = await import('./index.ts');

/** 대시보드가 보내는 것과 같은 형태로 서명된 요청을 만든다. */
function signedRequest(body: unknown): Request {
  const payload = JSON.stringify(body);
  const id = 'msg_test';
  const sentAt = new Date();
  const signature = new Webhook(HOOK_SECRET_RAW).sign(id, sentAt, payload);

  return new Request('https://example.test/send-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': Math.floor(sentAt.getTime() / 1000).toString(),
      'webhook-signature': signature,
    },
    body: payload,
  });
}

Deno.test('서명이 맞으면 솔라피 규격대로 발송한다', async () => {
  let captured: { url: string; init: RequestInit } | null = null;

  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return Promise.resolve(new Response(JSON.stringify({ statusCode: '2000' }), { status: 200 }));
  }) as typeof fetch;

  try {
    const response = await handleSendSms(
      signedRequest({ user: { phone: '821012345678' }, sms: { otp: '123456' } }),
    );

    assertEquals(response.status, 200);
    assertEquals(captured!.url, 'https://api.solapi.com/messages/v4/send');

    // 인증 헤더 4요소가 전부 있어야 하고, signature 는 hex 64자다.
    const auth = (captured!.init.headers as Record<string, string>).Authorization;
    assertMatch(auth, /^HMAC-SHA256 apiKey=TESTKEY123, date=.+, salt=.+, signature=[0-9a-f]{64}$/);

    // salt 는 12~64바이트여야 한다.
    const salt = /salt=([^,]+)/.exec(auth)![1];
    assertEquals(salt.length >= 12 && salt.length <= 64, true);

    // 번호는 국내 표기로 바뀌어야 한다. 82... 그대로 보내면 발송이 실패한다.
    const sent = JSON.parse(captured!.init.body as string);
    assertEquals(sent.message.to, '01012345678');
    assertEquals(sent.message.from, '0212345678');
    assertMatch(sent.message.text, /123456/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test('서명이 틀리면 401 이고 문자를 보내지 않는다', async () => {
  let called = false;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  try {
    const response = await handleSendSms(
      new Request('https://example.test/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': 'msg_test',
          'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
          'webhook-signature': 'v1,bogussignature',
        },
        body: JSON.stringify({ user: { phone: '821012345678' }, sms: { otp: '123456' } }),
      }),
    );

    assertEquals(response.status, 401);
    assertEquals(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
