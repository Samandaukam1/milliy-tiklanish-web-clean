# Payme Merchant API Sandbox

Endpoint:

```text
https://mtgazeta.uz/api/payme/merchant
```

## Environment

Set these as server-only variables in Vercel. Do not expose them with `EXPO_PUBLIC_`.

```env
PAYME_MERCHANT_ID=6a0aa667f424d415a5bc18da
PAYME_KEY=<TEST_KEY from Payme Business sandbox>
PAYME_MERCHANT_LOGIN=Paycom
PAYME_CHECKOUT_URL=https://checkout.paycom.uz
PAYME_MXIK_CODE=10899004001000000
PAYME_PACKAGE_CODE=123456
PAYME_VAT_PERCENT=12
SUPABASE_URL=<supabase project url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

For sandbox verification at `https://test.paycom.uz`, use the Merchant ID above, the TEST_KEY from the Payme cabinet, and the endpoint URL.

## Database

Run [supabase-payme.sql](../supabase-payme.sql) once in Supabase SQL Editor.

Created/updated tables:

- `payments`
- `payme_transactions`
- `subscriptions`
- `payment_logs`
- `profiles` subscription columns
- optional `users` subscription columns if `public.users` exists

## Create A Payment Intent

Before calling Merchant API methods manually, create a pending payment:

```http
POST https://mtgazeta.uz/api/payme/create-payment
Content-Type: application/json
```

```json
{
  "userId": "<existing_profiles_id>",
  "type": "subscription",
  "tier": "premium",
  "returnUrlBase": "https://mtgazeta.uz/payment-result",
  "language": "uz"
}
```

Use the returned `payment_id` in Merchant API `account.payment_id`.

Premium amount is `2400000` tiyin (`24 000 so'm`).

## Postman Setup

Request:

```text
POST https://mtgazeta.uz/api/payme/merchant
```

Headers:

```text
Content-Type: application/json
Authorization: Basic <base64(Paycom:{{PAYME_KEY}})>
```

Postman Authorization tab:

```text
Type: Basic Auth
Username: Paycom
Password: {{PAYME_KEY}}
```

Suggested variables:

```text
PAYME_KEY=<TEST_KEY from Payme cabinet>
payment_id=<payment_id from /api/payme/create-payment>
user_id=<existing_profiles_id>
payme_transaction_id=payme-sandbox-{{$timestamp}}
amount=2400000
from={{$timestamp}}
to={{$timestamp}}
```

## Test Payloads

### CheckPerformTransaction

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "CheckPerformTransaction",
  "params": {
    "amount": 2400000,
    "account": {
      "payment_id": "{{payment_id}}",
      "user_id": "{{user_id}}",
      "type": "subscription",
      "tier": "premium"
    }
  }
}
```

Expected: `result.allow = true`, with `detail.items[0].title`, `price`, `count`, `code`, `package_code`, `vat_percent`.

Minimal sandbox account also works:

```json
{
  "payment_id": "{{payment_id}}"
}
```

### CreateTransaction

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "CreateTransaction",
  "params": {
    "id": "{{payme_transaction_id}}",
    "time": 1710000000000,
    "amount": 2400000,
    "account": {
      "payment_id": "{{payment_id}}",
      "user_id": "{{user_id}}",
      "type": "subscription",
      "tier": "premium"
    }
  }
}
```

Expected: `state = 1`. Repeating the same request must return the same `create_time`, `transaction`, and `state`.

### PerformTransaction

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "PerformTransaction",
  "params": {
    "id": "{{payme_transaction_id}}"
  }
}
```

Expected: `state = 2`. The related profile gets `subscription = premium`, and `subscriptions` gets an active premium row.

### CheckTransaction

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "CheckTransaction",
  "params": {
    "id": "{{payme_transaction_id}}"
  }
}
```

Expected: `create_time`, `perform_time`, `cancel_time`, `transaction`, `state`, `reason`.

### CancelTransaction

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "CancelTransaction",
  "params": {
    "id": "{{payme_transaction_id}}",
    "reason": 1
  }
}
```

Expected:

- Created transaction cancellation: `state = -1`
- Performed transaction cancellation: `state = -2` and subscription is revoked to `free`
- Repeating the request returns the same state and `cancel_time`

### GetStatement

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "GetStatement",
  "params": {
    "from": 1700000000000,
    "to": 1890000000000
  }
}
```

Expected: `result.transactions` sorted by Payme creation time.

## Negative Tests

Invalid amount:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "CheckPerformTransaction",
  "params": {
    "amount": 1,
    "account": {
      "payment_id": "{{payment_id}}"
    }
  }
}
```

Expected error: `-31001`.

Invalid account:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "CheckPerformTransaction",
  "params": {
    "amount": 2400000,
    "account": {
      "payment_id": "00000000-0000-0000-0000-000000000000"
    }
  }
}
```

Expected error: `-31050` with `data = payment_id`.

Invalid authorization:

```text
Authorization: Basic <wrong-token>
```

Expected error: `-32504`.

Duplicate new transaction for the same pending payment:

1. Call `CreateTransaction` with `payme_transaction_id=A`.
2. Call `CreateTransaction` again with `payme_transaction_id=B` for the same `payment_id`.

Expected error: `-31008`.

Expired transaction:

1. Create a transaction.
2. Make its `create_time` older than 12 hours in `payme_transactions`.
3. Call `PerformTransaction`.

Expected error: `-31008`; local transaction becomes `state = -1`, `reason = 4`.

## Payme Sandbox Flow

1. Deploy the API to Vercel.
2. Set `PAYME_MERCHANT_ID`, `PAYME_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
3. Run [supabase-payme.sql](../supabase-payme.sql).
4. Create a real pending payment from the app or `/api/payme/create-payment`.
5. Open `https://test.paycom.uz`.
6. Enter Merchant ID, TEST_KEY, and endpoint URL.
7. Use one-time account mode and pass `payment_id` as the account field.
8. Run both sandbox scenarios:
   - create and cancel an unconfirmed transaction
   - create, perform, check, and cancel a performed transaction

All successful and failed Merchant API calls are stored in `payment_logs`.
