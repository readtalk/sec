import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { DashboardHTML } from "../app/dashboard";
import { ProfileHTML, NotFoundHTML } from "../app/profile";

const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

const COOKIE_NAME = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const USER_FIELDS =
  "id, email, created_at, username, display_name, avatar, links";

const PLATFORM_DEFS: Array<{ key: string; base: string; prefix: string }> = [
  { key: "instagram", base: "https://instagram.com/", prefix: "" },
  { key: "facebook", base: "https://facebook.com/", prefix: "" },
  { key: "tiktok", base: "https://tiktok.com/@", prefix: "@" },
  { key: "twitter", base: "https://x.com/", prefix: "" },
  { key: "youtube", base: "https://youtube.com/@", prefix: "@" },
  { key: "linkedin", base: "https://linkedin.com/in/", prefix: "" },
  { key: "github", base: "https://github.com/", prefix: "" },
];

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar: string | null;
  links: string | null;
};

type ProfileUserRow = {
  username: string;
  display_name: string | null;
  avatar: string | null;
  links: string | null;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // --- Redirect awal ---
    if (url.pathname === "/") {
      url.searchParams.set("redirect_uri", url.origin + "/callback");
      url.searchParams.set("client_id", "your-client-id");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", "/dashboard");
      url.pathname = "/authorize";
      return Response.redirect(url.toString());
    }

    // --- Callback ---
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

    // --- Profil publik /@username ---
    if (url.pathname.startsWith("/@")) {
      const username = decodeURIComponent(url.pathname.slice(2));

      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(username)) {
        return new Response(NotFoundHTML(username), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      let user: ProfileUserRow | null = null;
      try {
        user = await env.GLOBAL_DB.prepare(
          "SELECT username, display_name, avatar, links FROM user WHERE username = ?"
        )
          .bind(username)
          .first<ProfileUserRow>();
      } catch (err) {
        console.error("D1 query failed on profile:", err);
        return new Response("Internal error", { status: 500 });
      }

      if (!user) {
        return new Response(NotFoundHTML(username), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      return new Response(ProfileHTML(user), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // --- Dashboard: POST (simpan) ---
    if (url.pathname === "/dashboard" && request.method === "POST") {
      const cookies = parseCookies(request.headers.get("Cookie"));
      const raw = cookies[COOKIE_NAME];
      const userId = raw ? await verifySession(raw, env.SESSION) : null;

      if (!userId) {
        return new Response(null, { status: 302, headers: { Location: "/" } });
      }

      const form = await request.formData();
      const username = String(form.get("username") ?? "").trim() || null;
      const displayName = String(form.get("display_name") ?? "").trim() || null;
      const avatar = String(form.get("avatar") ?? "").trim() || null;

      const linksObj: Record<string, string> = {};

      for (const p of PLATFORM_DEFS) {
        let slug = String(form.get(`link_${p.key}`) ?? "").trim();
        if (!slug) continue;
        if (p.prefix && slug.startsWith(p.prefix)) {
          slug = slug.slice(p.prefix.length);
        }
        if (slug.startsWith("http")) {
          slug = slug.replace(/^https?:\/\//, "").replace(/^www\./, "");
          const parts = slug.split("/").filter(Boolean);
          slug = parts[parts.length - 1] ?? "";
        }
        slug = slug.replace(/\/+$/, "");
        if (!slug) continue;
        linksObj[p.key] = `${p.base}${slug}`;
      }

      const website = String(form.get("link_website") ?? "").trim();
      if (website) linksObj["website"] = website;

      const links =
        Object.keys(linksObj).length > 0 ? JSON.stringify(linksObj) : null;

      let error: string | null = null;
      if (username && !/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        error = "Username tidak valid (3-32 karakter, huruf/angka/_/-).";
      }

      if (error) {
        const user = await env.GLOBAL_DB.prepare(
          `SELECT ${USER_FIELDS} FROM user WHERE id = ?`
        )
          .bind(userId)
          .first<UserRow>();
        return new Response(DashboardHTML(user as UserRow, { error }), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      try {
        await env.GLOBAL_DB.prepare(
          `UPDATE user SET username = ?, display_name = ?, avatar = ?, links = ? WHERE id = ?`
        )
          .bind(username, displayName, avatar, links, userId)
          .run();
      } catch (err) {
        console.error("Update failed:", err);
        const user = await env.GLOBAL_DB.prepare(
          `SELECT ${USER_FIELDS} FROM user WHERE id = ?`
        )
          .bind(userId)
          .first<UserRow>();
        return new Response(
          DashboardHTML(user as UserRow, {
            error: "Gagal menyimpan (mungkin username sudah dipakai).",
          }),
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }

      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard?ok=1" },
      });
    }

    // --- Dashboard: GET ---
    if (url.pathname === "/dashboard") {
      const cookies = parseCookies(request.headers.get("Cookie"));
      const raw = cookies[COOKIE_NAME];
      const userId = raw ? await verifySession(raw, env.SESSION) : null;

      if (!userId) {
        const headers = new Headers({ Location: "/" });
        headers.append("Set-Cookie", clearSessionCookie(url));
        return new Response(null, { status: 302, headers });
      }

      let user: UserRow | null = null;
      try {
        user = await env.GLOBAL_DB.prepare(
          `SELECT ${USER_FIELDS} FROM user WHERE id = ?`
        )
          .bind(userId)
          .first<UserRow>();
      } catch (err) {
        console.error("D1 query failed on /dashboard:", err);
        return new Response("Internal error", { status: 500 });
      }

      if (!user) {
        const headers = new Headers({ Location: "/" });
        headers.append("Set-Cookie", clearSessionCookie(url));
        return new Response(null, { status: 302, headers });
      }

      const flash = url.searchParams.get("ok")
        ? { ok: "Profil tersimpan." }
        : undefined;

      return new Response(DashboardHTML(user, flash), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // --- Logout ---
    if (url.pathname === "/logout") {
      const headers = new Headers({ Location: "/" });
      headers.append("Set-Cookie", clearSessionCookie(url));
      return new Response(null, { status: 302, headers });
    }

    // --- OpenAuth ---
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
        const cookieValue = await signSession(userId, env.SESSION);
        const headers = new Headers({ Location: "/dashboard" });
        headers.append("Set-Cookie", buildSessionCookie(cookieValue, url));
        return new Response(null, { status: 302, headers });
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// HMAC
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

async function signSession(userId: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(userId));
  return `${userId}.${toHex(sig)}`;
}

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

  if (providedSig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < providedSig.length; i++) {
    diff |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0 ? userId : null;
}

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

function buildSessionCookie(value: string, url: URL): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
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
    `${COOKIE_NAME}=`,
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
// User
// ---------------------------------------------------------------------------

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.GLOBAL_DB.prepare(
    `INSERT INTO user (email) VALUES (?)
     ON CONFLICT (email) DO UPDATE SET email = email
     RETURNING id;`
  )
    .bind(email)
    .first<{ id: string }>();

  if (!result) throw new Error(`Unable to process user: ${email}`);
  return result.id;
}
