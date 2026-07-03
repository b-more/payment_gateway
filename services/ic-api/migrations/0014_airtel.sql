-- Airtel processor attempt tracking (§ STATE MACHINE + RECONCILIATION).
--
-- One business transaction (transactions.id) can have one or more Airtel
-- attempts (a new attempt is only ever created after the previous one is
-- confirmed failed/not-found — see the UNKNOWN/enquiry flow). Each attempt has
-- its own globally-unique id we send to Airtel (airtel_txn_id), tracks the
-- Airtel-side references (airtel_money_id), and its state transitions are
-- recorded append-only with a REDACTED raw payload for audit/support.

CREATE TABLE airtel_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid REFERENCES transactions(id),          -- null for standalone (e.g. KYC) checks
  direction       transaction_type NOT NULL,                 -- COLLECTION | DISBURSEMENT
  airtel_env      text NOT NULL,                             -- PRODUCTION | STAGING
  msisdn          text,
  amount_ngwee    bigint CHECK (amount_ngwee IS NULL OR amount_ngwee >= 0),
  airtel_txn_id   text NOT NULL UNIQUE,                       -- the id WE generate and send (never reused)
  attempt_no      integer NOT NULL DEFAULT 1,
  state           text NOT NULL DEFAULT 'CREATED'
                    CHECK (state IN ('CREATED','INITIATED','PENDING','SUCCESS','FAILED','UNKNOWN')),
  airtel_money_id text,                                       -- Airtel reference, e.g. MP260702.2347.B23113
  result_code     text,                                      -- e.g. DP00800001001
  request_id      text,                                      -- our outbound X-Request-Id
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX idx_airtel_attempts_txn ON airtel_attempts(transaction_id);
CREATE INDEX idx_airtel_attempts_money_id ON airtel_attempts(airtel_money_id);
-- Non-final attempts the reconciliation job re-enquires.
CREATE INDEX idx_airtel_attempts_unresolved ON airtel_attempts(state)
  WHERE state IN ('INITIATED','PENDING','UNKNOWN');

-- Append-only transition log (never updated/deleted; NN-9-style audit).
CREATE TABLE airtel_attempt_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES airtel_attempts(id),
  from_state  text,
  to_state    text NOT NULL,
  source      text NOT NULL DEFAULT 'API',                   -- API | ENQUIRY | CALLBACK | RECONCILE
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,            -- REDACTED: never tokens/PIN/full KYC
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_airtel_events_attempt ON airtel_attempt_events(attempt_id, created_at);

-- Grants (each migration grants explicitly). The /v1 API (ic_app_api) initiates
-- and enquires; admin (ic_app_admin) reads + runs reconciliation.
GRANT SELECT, INSERT, UPDATE ON airtel_attempts TO ic_app_api, ic_app_admin;
GRANT SELECT, INSERT ON airtel_attempt_events TO ic_app_api, ic_app_admin;
