type CookieStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      const value = rest.join("=");
      // Debug logging for code verifier retrieval
      if (name.includes("code-verifier")) {
        console.log("[CookieStorage] Retrieved code verifier:", name, "✓");
        console.log("[CookieStorage] Value length:", value.length);
      }
      return value;
    }
  }

  // Debug logging when code verifier is NOT found
  if (name.includes("code-verifier")) {
    console.log("[CookieStorage] Code verifier NOT found:", name);
    console.log(
      "[CookieStorage] Available cookies:",
      document.cookie || "none"
    );
    console.log("[CookieStorage] Looking for exact name:", name);
  }

  return null;
}

function setCookie(name: string, value: string) {
  if (typeof document === "undefined") return;

  const isSecure = window.location.protocol === "https:";
  const maxAgeSeconds = 60 * 60 * 24 * 365;

  // Encode the name but NOT the value - Supabase handles value encoding
  const cookieString = [
    `${name}=${value}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    isSecure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");

  document.cookie = cookieString;

  // Debug logging for code verifier
  if (name.includes("code-verifier")) {
    console.log("[CookieStorage] Setting code verifier cookie:", name);
    console.log("[CookieStorage] Cookie value length:", value.length);
    console.log("[CookieStorage] Cookie string:", cookieString);
    // Verify it was set
    setTimeout(() => {
      const retrieved = getCookie(name);
      console.log(
        "[CookieStorage] Verified code verifier:",
        retrieved ? "✓ Found" : "✗ Not found"
      );
      if (retrieved) {
        console.log(
          "[CookieStorage] Retrieved value matches:",
          retrieved === value
        );
      }
    }, 100);
  }
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export const cookieStorage: CookieStorage = {
  getItem: (key) => getCookie(key),
  setItem: (key, value) => setCookie(key, value),
  removeItem: (key) => deleteCookie(key),
};
