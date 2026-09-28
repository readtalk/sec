import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { DashboardHTML } from "../app/dashboard";

const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // --- Redirect awal ke /authorize ---
    if (url.pathname === "/") {
      url.searchParams.set("redirect_uri", url.origin + "/callback");
      url.searchParams.set("client_id", "your-client-id");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", "/dashboard");
      url.pathname = "/authorize";
      return Response.redirect(url.toString());
    }

    // --- Callback: verifikasi state ---
    if (url.pathname === "/callback") {
      const state = url.searchParams.get("state");
      const target =
        state && state.startsWith("/") && !state.startsWith("//")
          ? state
          : "/";

      return new Response(null, {
        status: 302,
        headers: { Location: target },
      });
    }

    // --- Dashboard: verifikasi HMAC cookie ---
    if (url.pathname === "/dashboard") {
      const cookies = parseCookies(request.headers.get("Cookie"));
      const raw = cookies[SESSION_COOKIE];

      const userId = raw
        ? await verifySession(raw, env.SESSION_SECRET)
        : null;

      if (!userId) {
        const headers = new Headers({ Location: "/" });
        headers.append("Set-Cookie", clearSessionCookie(url));
        return new Response(null, { status: 302, headers });
      }

      let user: { id: string; email: string } | null = null;
      try {
        user = await env.GLOBAL_DB.prepare(
          "SELECT id, email FROM user WHERE id = ?"
        )
          .bind(userId)
          .first<{ id: string; email: string }>();
      } catch (err) {
        console.error("D1 query failed on /dashboard:", err);
        return new Response("Internal error", { status: 500 });
      }

      if (!user) {
        const headers = new Headers({ Location: "/" });
        headers.append("Set-Cookie", clearSessionCookie(url));
        return new Response(null, { status: 302, headers });
      }

      return new Response(DashboardHTML(user), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // --- Logout ---
    if (url.pathname === "/logout") {
      const headers = new Headers({ Location: "/" });
      headers.append("Set-Cookie", clearSessionCookie(url));
      return new Response(null, { status: 302, headers });
    }

    // --- Serahkan ke OpenAuth ---
    return issuer({
      storage: CloudflareStorage({
        namespace: env.GLOBAL_KV,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            sendCode: async (email, code) => {
              console.log(`Sending code ${code} to ${email}`);
            },
            copy: {
              input_code: "Code (check Worker logs)",
            },
          })
        ),
      },
      theme: {
        title: "Authentication",
        primary: "#FF0000",
        favicon:
          "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/public/favicon.ico",
        logo: {
          dark: "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/src/logo-dark.png",
          light:
            "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/src/logo-light.png",
        },
      },
      success: async (ctx, value) => {
        const userId = await getOrCreateUser(env, value.email);
        const cookieValue = await signSession(userId, env.SESSION_SECRET);

        const headers = new Headers({ Location: "/dashboard" });
        headers.append("Set-Cookie", buildSessionCookie(cookieValue, url));

        return new Response(null, { status: 302, headers });
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Session helpers (HMAC)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Menghasilkan "userId.signature" */
async function signSession(userId: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(userId));
  return `${userId}.${toHex(sig)}`;
}

/** Memverifikasi "userId.signature"; mengembalikan userId atau null */
async function verifySession(
  value: string,
  secret: string
): Promise<string | null> {
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const userId = value.slice(0, lastDot);
  const providedSig = value.slice(lastDot + 1);
  if (!userId || !providedSig) return null;

  const key = await importHmacKey(secret);
  const expectedBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(userId)
  );
  const expectedSig = toHex(expectedBuf);

  // Perbandingan constant-time
  if (providedSig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < providedSig.length; i++) {
    diff |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0 ? userId : null;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function buildSessionCookie(value: string, url: URL): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
    "Path=/",
  ];
  if (url.protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(url: URL): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Path=/",
  ];
  if (url.protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rest.join("="));
  }
  return out;
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  try {
    const result = await env.GLOBAL_DB.prepare(
      `
      INSERT INTO user (email)
      VALUES (?)
      ON CONFLICT (email) DO UPDATE SET email = email
      RETURNING id;
      `
    )
      .bind(email)
      .first<{ id: string }>();

    if (!result) {
      throw new Error(`Unable to process user: ${email}`);
    }

    console.log(`Found or created user ${result.id} with email ${email}`);
    return result.id;
  } catch (err) {
    console.error("getOrCreateUser failed:", err);
    throw err;
  }
}
