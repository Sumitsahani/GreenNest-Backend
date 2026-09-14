// Real provider checks without customer data or credentials in output.
require('dotenv').config({ quiet: true });
async function main() {
  const base = process.env.CHECK_API_URL || 'http://127.0.0.1:3000/api/v1';
  for (const path of ['/health', '/products', '/services', '/garden/plants']) {
    try {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(15_000) });
      const body = await response.json();
      console.log(
        'API',
        path,
        response.status,
        path === '/health'
          ? body.data?.database
          : body.success
            ? 'valid success envelope'
            : body.error?.code,
      );
    } catch {
      console.log('API', path, 'UNREACHABLE');
      process.exitCode = 1;
    }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply with OK only.' }] }],
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      const body = await response.json();
      console.log(
        'GEMINI',
        response.status,
        Boolean(body.candidates?.[0]?.content?.parts?.some((part) => part.text))
          ? 'TEXT_RECEIVED'
          : 'NO_VALID_RESPONSE',
      );
    } catch {
      console.log('GEMINI', 'REQUEST_FAILED');
    }
  }
}
main().catch(() => {
  console.log('CHECK_FAILED');
  process.exitCode = 1;
});
