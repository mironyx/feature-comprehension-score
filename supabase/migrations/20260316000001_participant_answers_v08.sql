-- Migration: participant_answers v0.8 schema drift fix
-- Adds score, score_rationale, is_reassessment columns.
-- Updates attempt_number CHECK constraint and UNIQUE constraint.
-- Adds missing index on participant_id.
-- Design reference: lld-phase-2-web-auth-db.md §2.1, ADR-0005 Option 4

-- Add new columns
ALTER TABLE participant_answers
  ADD COLUMN score          numeric(3,2) CHECK (score IS NULL OR score BETWEEN 0.0 AND 1.0),
  ADD COLUMN score_rationale text,
  ADD COLUMN is_reassessment boolean NOT NULL DEFAULT false;

-- Drop old attempt_number CHECK constraint and UNIQUE constraint
ALTER TABLE participant_answers
  DROP CONSTRAINT participant_answers_attempt_number_check,
  DROP CONSTRAINT participant_answers_participant_id_question_id_attempt_numb_key;

-- Add updated attempt_number CHECK constraint
ALTER TABLE participant_answers
  ADD CONSTRAINT chk_answers_attempt_number
    CHECK (
      attempt_number >= 1
      AND (
        (NOT is_reassessment AND attempt_number <= 3)
        OR is_reassessment
      )
    );

-- Add updated UNIQUE constraint including is_reassessment
ALTER TABLE participant_answers
  ADD CONSTRAINT uq_answers_participant_question_reassessment
    UNIQUE (participant_id, question_id, is_reassessment, attempt_number);

-- Add missing index on participant_id for query performance
CREATE INDEX idx_answers_participant ON participant_answers (participant_id);
