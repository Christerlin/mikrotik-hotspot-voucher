# Pay'm API — Integration Guide (MonCash · NatCash · Kashpaw)

> Battle-tested integration notes for the **Pay'm** payment aggregator, written
> for a fresh Claude Code session. Everything here was verified **live** against
> the production API (there is no sandbox). Where the official Pay'm docs are
> wrong, this file says so and gives the value that actually works.
>
> **Use case for this repo (`mikrotik-hotspot-voucher`):** let a customer pay for
> a Wi-Fi voucher with **MonCash / NatCash** instead of the manual WhatsApp flow.
> The only part you need for that is **cash-in (collecte)** — see §3. Cash-out
> (§4) is documented for completeness but a hotspot almost never needs it.

---

## 0. TL;DR — the 6 things that will bite you

1. **No sandbox.** Every call hits real money. Test with the smallest amount
   (20 HTG) and a real phone.
2. **Auth header is `x-access-token`, NOT `Authorization: Bearer`.** The official
   docs say Bearer — that returns `401`. Use `x-access-token`.
3. **NatCash rejects decimal amounts.** `montant: 150.15` → `503 ERR_PARAMETERS_INVALID`.
   Always send **whole gourdes** (`Math.ceil`), e.g. `151`. MonCash accepts decimals,
   but just always round so both rails work.
4. **No webhook.** You must **poll** `/api/paiement-verify` to know a payment
   succeeded. Poll from the client AND from a server-side cron (reconcile).
5. **The reference field is misspelled `refference_id`** (double `f`) on the
   cash-in endpoints. It is `reference` on the cash-out endpoints. Match exactly.
6. **Credit exactly once.** Use a unique `reference` per order and an **atomic
   "pending → paid" claim** so client polling + cron can't double-credit.

---

## 1. Base URL & credentials

| Item | Value |
|---|---|
| Base URL | `https://plopplop.solutionip.app` |
| Sandbox | ❌ none |
| `PAYM_CLIENT_ID` | `pp_...` (merchant id) |
| `PAYM_CLIENT_SECRET` | 64-char secret — **server-side only**, used for the withdrawal HMAC |

**Never commit credentials.** Put them in `.env` / router-side secure config, and
compute HMAC signatures on the server only — never in `login.html` or any
client-side JS.

```env
PAYM_BASE_URL=https://plopplop.solutionip.app
PAYM_CLIENT_ID=pp_xxxxxxxxxxxxxxxx
PAYM_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 2. Payment methods

| Method | Cash-in (collecte) | Cash-out (payout) |
|---|---|---|
| `moncash`  | ✅ | ✅ |
| `natcash`  | ✅ | ✅ |
| `kashpaw`  | ✅ | ❌ |
| `all`      | ✅ (customer picks on Pay'm's page) | — |

Fees: **cash-in ≈ 3 %** (customer pays 1000 HTG → your merchant balance gets 970 HTG).
Minimum cash-in amount: **20 HTG**.

**Prepaid balance model:** customer payments credit a **merchant balance**. That
same balance funds payouts. (See §4.4 — the payout side needs a separately
**activated + funded** "compte prépayé".)

---

## 3. CASH-IN (collecte) — the flow you need for vouchers

No auth token is required for cash-in; you send `client_id` in the body.

### 3.1 Create a payment — `POST /api/paiement-marchand`

Request:
```json
{
  "client_id": "pp_xxx",
  "refference_id": "VOUCHER-2026-000123",
  "montant": 200,
  "payment_method": "moncash"
}
```

- `refference_id` — **your** unique id for this order (double `f` — intentional).
  Reuse the voucher/order id. Must be unique per payment.
- `montant` — HTG, **whole gourdes**, `>= 20`. Round up (`Math.ceil`).
- `payment_method` — `moncash` | `natcash` | `kashpaw` | `all`.

Success response:
```json
{
  "status": true,
  "message": "...",
  "url": "https://.../pay/redirect/....",
  "transaction_id": "PM_..."
}
```

→ **Redirect the customer to `url`** (open in the browser). They pay on
MonCash/NatCash, then Pay'm marks the collection as paid.

> ⚠️ **NatCash shows an ad/publicity page after payment.** This is controlled by
> Pay'm/NatCash. There is **no `return_url` parameter** — extra fields you add to
> the body are silently ignored. The payment still completes; the customer just
> closes that page and returns to your portal, which detects success via polling.

### 3.1b Return URL — dashboard-only (verified live, 2026-07-26)

There is no per-payment `return_url` (see above), **but the Pay'm merchant
dashboard has a Return URL setting**. Setting it makes Pay'm redirect the
customer there after payment **instead of leaving them on the ad page** — this
is the fix for the "customer stuck on the publicity page" problem.

Two things the official docs don't tell you:

1. **It is account-level, tied to the `client_id`.** Every project sharing that
   `client_id` gets the same Return URL. If you run more than one integration,
   ask Pay'm for a **separate `client_id` per project** — otherwise one project's
   customers get redirected into another project's app.
2. **It must be a public HTTPS URL.** A captive-portal address like
   `http://hotspot.local/...` won't do — point it at your backend, and let the
   backend redirect onward to the portal.

**Pay'm appends the result as a query string** (undocumented; observed live):

```
GET /return?statut=ok&id_transaction=178507549444729550&refference_id=VOUCHER-2026-000123
```

- `statut` — French spelling (`statut`, not `status`)
- `refference_id` — your reference, double `f`, same as the cash-in endpoints
- A direct visit to the URL (no payment) arrives with an **empty** query string

Since you get your own reference back, the return handler can look the order up
and hand the customer their purchase without them typing anything — useful when
the captive-portal mini-browser has dropped the session. Treat the reference as
**not secret** (it travels through the browser URL): don't return the goods on
the reference alone; look up a per-order secret server-side and pass that, and
keep the lookup endpoint rate-limited/locked against enumeration.

### 3.2 Verify a payment (poll) — `POST /api/paiement-verify`

There is **no webhook**, so poll this until confirmed (or timeout).

Request:
```json
{ "client_id": "pp_xxx", "refference_id": "VOUCHER-2026-000123" }
```

Response:
```json
{
  "trans_status": "ok",      // "no" = not paid yet, "ok" = paid
  "montant": "200",          // NOTE: string, not number — coerce with Number()
  "id_transaction": "...",
  "method": "moncash"
}
```

- Poll every ~2.5–3 s, ~10–20 times from the client after redirect.
- **Also** run a server-side cron every ~2 min that re-checks any still-`pending`
  orders (in case the customer never returned to the portal). This is what makes
  it reliable.
- **Anti-fraud:** before you deliver the voucher, check the paid `montant`
  covers the price you expected (`Number(montant) >= expectedHtg`).

### 3.3 Delivering the voucher (this repo's job)

On the first verify that returns `trans_status: "ok"` **and** passes the amount
check:

1. **Atomically claim** the order (`UPDATE orders SET status='PAID' WHERE
   id=? AND status='PENDING'` — if 0 rows changed, someone already delivered it →
   stop). This prevents double-delivery from client + cron racing.
2. Pull/generate a MikroTik voucher (username = password, 8 chars — per this
   repo's convention) or bind the customer's MAC to a hotspot profile.
3. Show / SMS / display the voucher code.

### 3.4 Minimal Node.js cash-in helper

```js
const BASE = process.env.PAYM_BASE_URL;
const CLIENT_ID = process.env.PAYM_CLIENT_ID;

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-access-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Pay'm ${path} ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

// 1) create
async function createPayment({ reference, montantHtg, method }) {
  const montant = Math.ceil(montantHtg);          // whole gourdes (NatCash!)
  if (montant < 20) throw new Error("Minimum 20 HTG");
  const j = await post("/api/paiement-marchand", {
    client_id: CLIENT_ID,
    refference_id: reference,
    montant,
    payment_method: method,                        // moncash | natcash | kashpaw | all
  });
  if (!j.url) throw new Error("Pay'm: no redirect url");
  return { redirectUrl: j.url, transactionId: j.transaction_id };
}

// 2) verify (poll this)
async function verifyPayment(reference) {
  const j = await post("/api/paiement-verify", {
    client_id: CLIENT_ID,
    refference_id: reference,
  });
  return { paid: j.trans_status === "ok", amountHtg: Number(j.montant), raw: j };
}
```

---

## 4. CASH-OUT (payout) — optional, usually not needed for a hotspot

A hotspot **collects** money; it rarely pays money out. Only implement this if you
need to send HTG to a MonCash/NatCash number. It is a **signed 3-step** flow.

### 4.1 Step 1 — auth: `POST /api/auth/marchand`

```json
{ "client_id": "pp_xxx", "client_secret": "64charsecret" }
```
→ `{ "success": true, "token": "<marchand_token>", "expires_in": 300 }`
(token lasts ~5 min; cache and refresh early.)

### 4.2 Step 2 — signed withdrawal token: `POST /api/auth/marchand/withdrawal-token`

Header: **`x-access-token: <marchand_token>`** (NOT `Authorization: Bearer`).

```json
{
  "amount": 500,
  "method": "natcash",
  "recipient": "50912345678",
  "reference": "PAYOUT-0001",
  "timestamp": 1715691234,
  "withdrawal_signature": "<hmac hex>"
}
```

**Signature** (server-side only):
```js
const crypto = require("crypto");
const payload = [amount, method, recipient, reference, timestamp].join("|");
const signature = crypto.createHmac("sha256", CLIENT_SECRET).update(payload).digest("hex");
```
- Order is exact: `amount|method|recipient|reference|timestamp`.
- `timestamp` = current Unix seconds; rejected if off by > ±5 min.
- `recipient` = `509XXXXXXXX` (no `+`).
- `amount` = whole gourdes.

→ `{ "success": true, "withdrawal_token": "<token>" }`

### 4.3 Step 3 — execute: `POST /api/withdraw/marchand`

Header: **`x-access-token: <withdrawal_token>`** (the step-2 token, not step-1).
Body must be **identical** to what was signed (minus timestamp/signature):

```json
{ "amount": 500, "method": "natcash", "recipient": "50912345678", "reference": "PAYOUT-0001" }
```

→ success:
```json
{ "success": true, "data": { "transaction_id": "...", "fee": 12.5, "total": 512.5,
   "status": "success", "balance_before": 5000, "balance_after": 4487.5 } }
```

Status endpoint (reconcile after an ambiguous failure — do this **before**
refunding, so a payout that actually went through isn't double-paid):
`POST /api/withdraw/marchand/verify` with `{ "reference": "PAYOUT-0001" }` and
header `x-access-token: <marchand_token>` (step-1 token).

### 4.4 Payout prerequisites (learned the hard way)

The payout side uses a **separate "compte prépayé"** that must be:
1. **Activated** in the Pay'm merchant dashboard — until then every payout returns
   `400 NO_PREPAID_ACCOUNT` ("Compte prépayé introuvable").
2. **Funded**. An activated-but-empty account returns a vague
   `400 {"error_code":"empty","message":"Réessayer dans quelques instants"}`.
   Cash-in collections do **not** necessarily auto-fund it — confirm with Pay'm
   how to move the balance in.

Payout supports **`moncash` and `natcash` only** (no `kashpaw`).

---

## 5. Error codes reference

**Cash-in**
| HTTP / code | Meaning | Fix |
|---|---|---|
| `503 ERR_PARAMETERS_INVALID` | usually a **decimal `montant`** on NatCash | send whole gourdes |
| `status: false` | rejected | read `message` |

**Cash-out (step 3)**
| Code | Meaning | Fix |
|---|---|---|
| `NO_PREPAID_ACCOUNT` | payout account not activated | activate in dashboard |
| `INSUFFICIENT_BALANCE` / `empty` | prepaid balance too low / unfunded | fund the account |
| `METHOD_NOT_CONFIGURED` | method not enabled for payout | enable in dashboard |
| `WITHDRAWAL_COOLDOWN` (429) | < 120 s since last payout from this IP | wait ~120 s |
| `DUPLICATE_REFERENCE` (409) | reference already used | use a fresh reference |
| `INVALID_SIGNATURE` (403) | HMAC mismatch | recompute exactly (§4.2) |
| `TIMESTAMP_EXPIRED` | clock off > ±5 min | use current Unix time |
| `INVALID_TOKEN_TYPE` / `TOKEN_ALREADY_USED` (403) | wrong/used token | regenerate steps 1+2 |
| `PARAMETER_MISMATCH` (403) | step-3 body ≠ signed values | send identical values |
| `API_TRANSFER_FAILED` | MonCash/NatCash rejected the transfer | check recipient number |

---

## 6. Money-safety checklist (this is real money)

- [ ] Unique `reference` per order; never reuse.
- [ ] **Atomic** pending→paid claim before delivering a voucher.
- [ ] Verify `montant` paid ≥ price before delivering (anti-underpay).
- [ ] Poll `verify` from client **and** a server cron (don't rely on the customer
      returning to the portal).
- [ ] Expire stale pending orders (e.g. after 15 min) but never before a final
      `verify` says `no`.
- [ ] HMAC + secrets **server-side only**.
- [ ] For payouts: reconcile via `.../verify` before refunding on ambiguous errors.
- [ ] Log the **full** Pay'm error (`error_code` + `message`) — the generic
      "échoué" message hides why, and the errors are undiagnosable without it.

---

## 7. Suggested architecture for this hotspot

```
Customer (captive portal, login.html / prix.html)
      │  picks a plan (e.g. 200 HTG / 7 jours) + method
      ▼
Small backend (Node/PHP) you add — NOT in MikroTik JS
  1. POST /api/paiement-marchand  → get redirect url, store order PENDING
  2. redirect customer to Pay'm url
  3. client polls your backend → backend polls /api/paiement-verify
  4. cron re-checks PENDING orders every ~2 min
  5. on "ok" + amount OK → atomic claim → issue MikroTik voucher → show code
```

Keep all Pay'm calls and the `client_secret` on the backend. The MikroTik hotspot
pages (`login.html`, `prix.html`, `md5.js`, …) only talk to **your** backend, never
to Pay'm directly.

---

*Compiled from live testing of the Pay'm production API (July 2026). If a Pay'm
response contradicts this file, trust the live response and update this doc.*
