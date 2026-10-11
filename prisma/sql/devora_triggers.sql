-- ============================================================================
-- Devora — MySQL triggers Prisma cannot express
--
-- Postgres had a `devora_touch_updated_at()` trigger function attached to four
-- tables that stamped `updated_at = now()` before every UPDATE. Prisma's schema
-- language has no trigger concept, so the equivalent MySQL triggers are applied
-- here. They are what keeps a raw-SQL write path (an UPDATE that does not
-- mention updated_at) behaving exactly as it did on Postgres.
--
-- Idempotent: safe to run more than once.
--
-- Apply with:
--   mysql -h 127.0.0.1 -P 3306 -u root devora < prisma/sql/devora_triggers.sql
-- ============================================================================

DROP TRIGGER IF EXISTS profiles_touch_updated_at;
CREATE TRIGGER profiles_touch_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP(3);

DROP TRIGGER IF EXISTS platform_accounts_touch_updated_at;
CREATE TRIGGER platform_accounts_touch_updated_at
BEFORE UPDATE ON platform_accounts
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP(3);

DROP TRIGGER IF EXISTS platform_oauth_tokens_touch_updated_at;
CREATE TRIGGER platform_oauth_tokens_touch_updated_at
BEFORE UPDATE ON platform_oauth_tokens
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP(3);

DROP TRIGGER IF EXISTS projects_touch_updated_at;
CREATE TRIGGER projects_touch_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP(3);
