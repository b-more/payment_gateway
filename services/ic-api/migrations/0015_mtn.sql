-- MTN MoMo attempt tracking (parallel to airtel_attempts; the live Airtel table
-- is untouched). X-Reference-Id (a UUID we generate) is MTN's idempotency key and
-- the id used for status polling; financialTransactionId is MTN's own reference.

CREATE TABLE mtn_attempts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id           uuid REFERENCES transactions(id),
  direction                transaction_type NOT NULL,           -- COLLECTION | DISBURSEMENT
  mtn_env                  text NOT NULL,                        -- PRODUCTION | SANDBOX
  msisdn                   text,
  amount_ngwee             bigint CHECK (amount_ngwee IS NULL OR amount_ngwee >= 0),
  mtn_ref_id               uuid NOT NULL UNIQUE,                 -- our X-Reference-Id (never reused)
  external_id              text,                                 -- our externalId reference
  attempt_no               integer NOT NULL DEFAULT 1,
  state                    text NOT NULL DEFAULT 'CREATED'
                            CHECK (state IN ('CREATED','INITIATED','PENDING','SUCCESS','FAILED','UNKNOWN')),
  financial_transaction_id text,                                 -- MTN's reference
  reason                   text,                                 -- MTN failure reason/code
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz
);

CREATE INDEX idx_mtn_attempts_txn ON mtn_attempts(transaction_id);
CREATE INDEX idx_mtn_attempts_unresolved ON mtn_attempts(state)
  WHERE state IN ('INITIATED','PENDING','UNKNOWN');

CREATE TABLE mtn_attempt_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES mtn_attempts(id),
  from_state  text,
  to_state    text NOT NULL,
  source      text NOT NULL DEFAULT 'API',                      -- API | STATUS | CALLBACK | RECONCILE
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,               -- redacted (no tokens)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mtn_events_attempt ON mtn_attempt_events(attempt_id, created_at);

GRANT SELECT, INSERT, UPDATE ON mtn_attempts TO ic_app_api, ic_app_admin;
GRANT SELECT, INSERT ON mtn_attempt_events TO ic_app_api, ic_app_admin;
