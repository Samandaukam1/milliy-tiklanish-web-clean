# Payme Merchant API Sandbox

Endpoint:

```text
https://mtgazeta.uz/api/payme/merchant
```

## Environment

Set these as server-only variables in Vercel. Do not expose them with `EXPO_PUBLIC_`.

```env
PAYME_TEST_MODE=true
PAYME_MERCHANT_ID=6a0aa667f424d415a5bc18da
PAYME_SECRET_KEY=<sandbox secret key if PAYME_TEST_KEY is not used>
PAYME_TEST_KEY=<TEST_KEY from Payme Business sandbox>
PAYME_KEY=<production key only; leave empty in sandbox>
PAYME_MERCHANT_LOGIN=Paycom
PAYME_CHECKOUT_URL=https://checkout.paycom.uz
PAYME_MXIK_CODE=10899004001000000
PAYME_PACKAGE_CODE=121
PAYME_VAT_PERCENT=0
SUPABASE_URL=<supabase project url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

For sandbox verification at `https://test.paycom.uz`, use the Merchant ID above, set `PAYME_TEST_KEY` to the TEST_KEY from the Payme cabinet, and use the endpoint URL. If your deployment uses the generic name, put the sandbox secret in `PAYME_SECRET_KEY`. When `PAYME_TEST_MODE=true`, checkout links are generated with `https://test.paycom.uz` and `PAYME_KEY` is ignored.

## Database

Run [supabase-payme.sql](../supabase-payme.sql) once in Supabase SQL Editor.

Created/updated tables:

- `subscription_plans`
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

The returned `payment_id` is used by the app result page. Payme Merchant API sandbox tests should use the provider account fields below instead of `account.payment_id`.

Premium amount is `2400000` tiyin (`24 000 so'm`) for 30 days.

## Postman Setup

Request:

```text
POST https://mtgazeta.uz/api/payme/merchant
```

Headers:

```text
Content-Type: application/json
Authorization: Basic <base64(Paycom:{{PAYME_TEST_KEY}})>
```

Postman Authorization tab:

```text
Type: Basic Auth
Username: Paycom
Password: {{PAYME_TEST_KEY}}
```

Suggested variables:

```text
PAYME_TEST_KEY=<TEST_KEY from Payme cabinet>
user_id=<existing_profiles_id>
subscription_type=premium_monthly
subscription_id=premium
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
      "user_id": "{{user_id}}",
      "subscription_type": "premium_monthly",
      "subscription_id": "premium"
    }
  }
}
```

Expected: `result.allow = true`, with this Soliq detail object in `result.detail`:

```json
{
  "receipt_type": 0,
  "items": [
    {
      "title": "Milliy Tiklanish Premium",
      "price": 2400000,
      "count": 1,
      "code": "10899004001000000",
      "package_code": "121",
      "vat_percent": 0
    }
  ]
}
```

Legacy app compatibility still works if `payment_id` is present, but it is not required by the sandbox form:

```json
{
  "payment_id": "<optional_existing_payment_id>",
  "user_id": "{{user_id}}",
  "subscription_type": "premium_monthly",
  "subscription_id": "premium"
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
      "user_id": "{{user_id}}",
      "subscription_type": "premium_monthly",
      "subscription_id": "premium"
    }
  }
}
```

Expected: `state = 1`. If there is no pending `payments` row, the API creates one automatically. Repeating the same request must return the same `create_time`, `transaction`, and `state`.

Important: `params.id` is the Payme transaction id. It is stored in `payme_transactions.payme_transaction_id`, `payme_transactions.payme_id`, and the legacy `external_transaction_id` column when those columns exist. Use the same `params.id` for `CheckTransaction`, `PerformTransaction`, and `CancelTransaction`.

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

Expected: `state = 2`. The related profile gets `subscription = premium`, `premium_until = paid_at + 30 days`, and `subscriptions` gets an active premium row.

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
      "user_id": "{{user_id}}",
      "subscription_type": "premium_monthly",
      "subscription_id": "premium"
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
      "user_id": "00000000-0000-0000-0000-000000000000",
      "subscription_type": "premium_monthly",
      "subscription_id": "premium"
    }
  }
}
```

Expected error: `-31050` with `data = user_id`.

Invalid authorization:

```text
Authorization: Basic <wrong-token>
```

Expected error: `-32504`.

Duplicate new transaction for the same pending subscription payment:

1. Call `CreateTransaction` with `payme_transaction_id=A`.
2. Call `CreateTransaction` again with the same `payme_transaction_id=A`.

Expected: the same `create_time`, `transaction`, and `state`.

Account busy while another transaction is pending:

1. Call `CreateTransaction` with `payme_transaction_id=A`.
2. Call `CreateTransaction` again with `payme_transaction_id=B` for the same pending premium monthly account.

Expected error: `-31050` with `data = account`.

Expired transaction:

1. Create a transaction.
2. Make its `create_time` older than 12 hours in `payme_transactions`.
3. Call `PerformTransaction`.

Expected error: `-31008`; local transaction becomes `state = -1`, `reason = 4`.

## Payme Sandbox Flow

1. Deploy the API to Vercel.
2. Set `PAYME_TEST_MODE=true`, `PAYME_MERCHANT_ID`, `PAYME_TEST_KEY` or `PAYME_SECRET_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
3. Run [supabase-payme.sql](../supabase-payme.sql).
4. Create a real pending payment from the app or let `CreateTransaction` create it automatically.
5. Open `https://test.paycom.uz`.
6. Enter Merchant ID, TEST_KEY, and endpoint URL.
7. Use these account fields:
   - `user_id`: real `profiles.id`
   - `subscription_type`: `premium_monthly`
   - `subscription_id`: `premium`
8. Run both sandbox scenarios:
   - create and cancel an unconfirmed transaction
   - create, perform, check, and cancel a performed transaction

All successful and failed Merchant API calls are stored in `payment_logs`.
