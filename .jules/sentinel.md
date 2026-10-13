## 2026-10-13 - Telegram Bot Token URL Redaction Edge Case
**Vulnerability:** Word boundary `\b` in token matching regex (`/\b\d{8,12}:.../`) failed to match Telegram bot tokens embedded directly in Telegram API endpoint URLs (e.g., `https://api.telegram.org/bot<token>/sendMessage`) because 't' in 'bot' and '1' in the token are both word characters.
**Learning:** `\b` requires a transition between word and non-word characters. When tokens are prefixed immediately by letters like `bot`, `\b` fails.
**Prevention:** Use negative lookbehind `(?<!\d)` instead of `\b` when redacting numeric IDs in URLs or continuous string prefixes.
