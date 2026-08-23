import { Router } from "express";
import { clerkClient } from "@clerk/express";

export const devTokenRouter = Router();

// GET /dev-token — show the sign-in form
devTokenRouter.get("/", (_req, res) => {
  const frontendApi = (process.env.CLERK_PUBLISHABLE_KEY ?? "")
    .replace("pk_test_", "")
    .replace("pk_live_", "");

  let domain = "";
  try {
    domain = Buffer.from(frontendApi, "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    domain = "";
  }

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Dev Token Helper</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; background: #f5f5f5; }
    h2 { color: #1B2A4A; margin-bottom: 4px; }
    .sub { color: #718096; font-size: 14px; margin-bottom: 24px; }
    .card { background: white; border-radius: 10px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    label { display: block; font-size: 13px; font-weight: 600; color: #4A5568; margin-bottom: 6px; margin-top: 16px; }
    input { width: 100%; padding: 10px 14px; border: 1px solid #CBD5E0; border-radius: 6px; font-size: 15px; outline: none; }
    input:focus { border-color: #0D8A7A; box-shadow: 0 0 0 3px rgba(13,138,122,0.1); }
    button { width: 100%; padding: 12px; font-size: 15px; background: #0D8A7A; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 20px; font-weight: 600; }
    button:hover { background: #0a7269; }
    button:disabled { background: #a0aec0; cursor: not-allowed; }
    .warning { background: #FDF3E3; border-left: 4px solid #C97B2A; padding: 12px 14px; border-radius: 4px; font-size: 13px; color: #7B4F1A; margin-bottom: 20px; }
    .error { background: #FEF2F2; border-left: 4px solid #E53E3E; padding: 12px 14px; border-radius: 4px; font-size: 13px; color: #C53030; margin-top: 16px; display: none; }
    .success { display: none; margin-top: 20px; }
    .success-label { font-size: 13px; font-weight: 600; color: #276749; margin-bottom: 8px; }
    textarea { width: 100%; font-family: monospace; font-size: 11px; padding: 10px; border: 1px solid #CBD5E0; border-radius: 6px; background: #F7FAFC; resize: none; }
    .copy-btn { width: 100%; padding: 10px; background: #276749; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 8px; font-size: 14px; }
    .copied { color: #276749; font-weight: 600; font-size: 13px; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <h2>Dev Token Helper</h2>
  <p class="sub">Sign in as your test user to get a session token</p>

  <div class="warning">
    ⚠ Use the <strong>test user you created in your finance app</strong> — not your Clerk admin login.
  </div>

  <div class="card">
    <label>Email</label>
    <input type="email" id="email" placeholder="test@test.com" />

    <label>Password</label>
    <input type="password" id="password" placeholder="Your test user password" />

    <button id="btn" onclick="signIn()">Get Session Token</button>
    <div class="error" id="error"></div>

    <div class="success" id="success">
      <div class="success-label">✓ Token ready — valid for ~1 hour</div>
      <textarea id="token-out" rows="6" readonly></textarea>
      <button class="copy-btn" onclick="copyToken()">Copy to Clipboard</button>
      <div class="copied" id="copied">Copied!</div>
    </div>
  </div>

  <script>
    async function signIn() {
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const btn = document.getElementById("btn");
      const errorEl = document.getElementById("error");

      errorEl.style.display = "none";
      errorEl.textContent = "";

      if (!email || !password) {
        showError("Please enter your email and password.");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Signing in...";

      try {
        const resp = await fetch("/dev-token/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await resp.json();

        if (!resp.ok) {
          showError(data.error || "Sign in failed. Check your email and password.");
          return;
        }

        document.getElementById("token-out").value = data.token;
        document.getElementById("success").style.display = "block";
        btn.textContent = "Refresh Token";
      } catch (e) {
        showError("Request failed: " + e.message);
      } finally {
        btn.disabled = false;
        if (btn.textContent === "Signing in...") btn.textContent = "Get Session Token";
      }
    }

    function copyToken() {
      const ta = document.getElementById("token-out");
      ta.select();
      document.execCommand("copy");
      document.getElementById("copied").style.display = "block";
      setTimeout(() => document.getElementById("copied").style.display = "none", 2000);
    }

    function showError(msg) {
      const el = document.getElementById("error");
      el.textContent = msg;
      el.style.display = "block";
    }

    document.getElementById("password").addEventListener("keydown", function(e) {
      if (e.key === "Enter") signIn();
    });
  </script>
</body>
</html>`);
});

// POST /dev-token/signin — called by the form above
// Uses Clerk's Backend API to verify credentials and return a session token
devTokenRouter.post("/signin", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    // Find the user by email using the backend SDK
    const users = await clerkClient.users.getUserList({ emailAddress: [email] });

    if (!users.data || users.data.length === 0) {
      res.status(401).json({ error: "No user found with that email address." });
      return;
    }

    const user = users.data[0];

    // Verify the password using Clerk's backend SDK
    const verified = await clerkClient.users.verifyPassword({
      userId: user.id,
      password,
    });

    if (!verified) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    // Create a sign-in token for this user (valid 1 hour)
    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 3600,
    });

    res.json({ token: signInToken.token, userId: user.id });
  } catch (err: any) {
    console.error("Dev token sign-in error:", err);
    const msg = err?.errors?.[0]?.message ?? err?.message ?? "Sign in failed.";
    res.status(500).json({ error: msg });
  }
});