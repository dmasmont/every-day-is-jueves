# Every day is Jueves — Debug Build

This build adds:
- **Top 3** headlines (down from 5) to reduce rate-limit issues.
- A **Debug panel** (toggle in the header) that logs each request, status codes, and errors.
- **Retries + backoff** for rss2json and Pollinations text endpoints.
- **Throttling** between items to be gentle with public services.
- Explicit image size `768x768`.

If images still don't show, check the Debug panel for:
- Pollinations image URL (click it to open in a new tab).
- HTTP status codes (429 = rate limited).
- Unexpected content-types from RSS converters.

Everything else is the same as the regular build.
