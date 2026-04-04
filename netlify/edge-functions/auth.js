export default async function handler(req, context) {
    const PASSWORD = Deno.env.get("DASHBOARD_PASSWORD");
    const cookie = req.headers.get("cookie") || "";
    const authed = cookie.split(";").some(c => c.trim() === "bd_auth=ok");

    if (authed) return context.next();

    if (req.method === "POST") {
        try {
            const formData = await req.formData();
            const input = formData.get("password");

            if (input === PASSWORD) {
                const response = await context.next();
                const newRes = new Response(response.body, response);
                newRes.headers.append(
                    "Set-Cookie",
                    "bd_auth=ok; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000"
                );
                return newRes;
            }

            return new Response(loginPage("Feil passord — prøv igjen"), {
                status: 401,
                headers: { "content-type": "text/html;charset=utf-8" }
            });
        } catch(e) {
            return new Response(loginPage("Noe gikk galt — prøv igjen"), {
                status: 400,
                headers: { "content-type": "text/html;charset=utf-8" }
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
    <form method="POST">
      <label for="pw">Passord</label>
      <input type="password" id="pw" name="password" autofocus autocomplete="current-password">
      ${error ? `<div class="error">${error}</div>` : ""}
      <button type="submit">Logg inn</button>
    </form>
  </div>
</body>
</html>`;
}

export const config = { path: "/*" };
