export default async function handler(req, context) {
    const PASSWORD = Deno.env.get("DASHBOARD_PASSWORD");
    const cookie = req.headers.get("cookie") || "";
    const authed = cookie.split(";").some(c => c.trim() === "bd_auth=ok");

    if (authed) return context.next();

    if (req.method === "POST") {
        try {
            const body = await req.text();
            const params = new URLSearchParams(body);
            const input = params.get("password");

            if (PASSWORD && input === PASSWORD) {
                const headers = new Headers();
                headers.set("Set-Cookie", "bd_auth=ok; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000");
                headers.set("Content-Type", "application/json");
                return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
            }

            return new Response(JSON.stringify({ ok: false }), {
                status: 401,
                headers: { "content-type": "application/json" }
            });
        } catch(e) {
            return new Response(JSON.stringify({ ok: false, error: e.message }), {
                status: 400,
                headers: { "content-type": "application/json" }
            });
        }
    }

    return new Response(loginPage(""), {
        status: 401,
        headers: { "content-type": "text/html;charset=utf-8" }
    });
}

function loginPage(error) {
    return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Borregaard Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a2332; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #fff; border-radius: 12px; padding: 2.5rem 2rem; width: 100%; max-width: 360px; }
  h1 { font-size: 18px; font-weight: 500; margin-bottom: 6px; color: #111; }
  p { font-size: 13px; color: #666; margin-bottom: 1.5rem; }
  label { font-size: 12px; font-weight: 500; color: #444; display: block; margin-bottom: 6px; }
  input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 1rem; outline: none; }
  input:focus { border-color: #0066cc; }
  button { width: 100%; padding: 10px; background: #0066cc; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; }
  button:hover { background: #0052a3; }
  .error { color: #c0392b; font-size: 13px; margin-bottom: 1rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>Borregaard Dashboard</h1>
    <p>Logg inn for å fortsette</p>
    <div id="error" style="color:#c0392b;font-size:13px;margin-bottom:1rem;display:none;"></div>
    <label for="pw">Passord</label>
    <input type="password" id="pw" autofocus autocomplete="current-password">
    <button id="btn" onclick="loggInn()">Logg inn</button>
  </div>
  <script>
    document.getElementById('pw').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') loggInn();
    });
    async function loggInn() {
      const pw = document.getElementById('pw').value;
      const btn = document.getElementById('btn');
      const err = document.getElementById('error');
      btn.textContent = 'Logger inn...';
      btn.disabled = true;
      try {
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'password=' + encodeURIComponent(pw)
        });
        if (res.ok) {
          window.location.reload();
        } else {
          err.textContent = 'Feil passord — prøv igjen';
          err.style.display = 'block';
          btn.textContent = 'Logg inn';
          btn.disabled = false;
          document.getElementById('pw').value = '';
          document.getElementById('pw').focus();
        }
      } catch(e) {
        err.textContent = 'Noe gikk galt — prøv igjen';
        err.style.display = 'block';
        btn.textContent = 'Logg inn';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

export const config = { path: "/*" };
