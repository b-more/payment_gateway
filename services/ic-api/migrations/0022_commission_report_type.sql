-- 0022_commission_report_type.sql
-- Add COMMISSION as a report type.
--
-- Instacom's commission is the `charge` retained on every successful collection.
-- It was stored per transaction but never reportable as a total or a breakdown.
-- This adds the enum value so a COMMISSION report can be created like any other;
-- the report body is built in ReportService from the existing charge column.
--
-- ADD VALUE runs inside the migrate runner's per-file transaction on PostgreSQL
-- 12+ as long as the new value is not USED in the same transaction, which it is
-- not here. IF NOT EXISTS makes it re-runnable.

ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'COMMISSION';
