/**
 * Netlify Function: proxy
 * Purpose: Bypass browser CORS by proxying requests to YiShou API (or other targets).
 *
 * Client sends:
 * {
 *   "url": "https://api.yishouapp.com/...",
 *   "method": "POST",
 *   "body": "a=b&c=d", // optional
 *   "requestHeaders": { "Content-Type": "...", "User-Agent": "...", ... } // optional
 * }
 */
const fetch = require("node-fetch");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const targetUrl = payload.url;
    const method = (payload.method || "POST").toUpperCase();
    const body = payload.body;
    const requestHeaders = payload.requestHeaders || {};

    if (!targetUrl || typeof targetUrl !== "string") {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Missing 'url' in request body." }),
      };
    }

    // Basic SSRF guard: only allow http(s)
    if (!/^https?:\/\//i.test(targetUrl)) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Invalid url. Must start with http(s)://." }),
      };
    }

    // Sanitize headers
    const headers = { ...requestHeaders };
    delete headers.host;
    delete headers.Host;
    delete headers["content-length"];
    delete headers["Content-Length"];
    delete headers["accept-encoding"];
    delete headers["Accept-Encoding"];

    const resp = await fetch(targetUrl, {
      method,
      headers,
      body: body,
    });

    const text = await resp.text();

    // Try to return JSON if possible, else return text wrapped in JSON.
    let outBody;
    let contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      outBody = text; // already json
    } else {
      // attempt parse anyway
      try {
        JSON.parse(text);
        outBody = text;
        contentType = "application/json; charset=utf-8";
      } catch (_) {
        outBody = JSON.stringify({ data: text });
        contentType = "application/json; charset=utf-8";
      }
    }

    return {
      statusCode: resp.status,
      headers: { ...corsHeaders(), "Content-Type": contentType },
      body: outBody,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
