-- Exports without the Meltemi branding (change unbranded-exports, spec cloud-accounts,
-- "Entitlements"): an administrator entitles a person's account to export without the strip at the
-- foot of the sheet, and may revoke it. The flag is the person's, kept on their row, and goes with
-- the row when the person is deleted.

-- Whether the person may export without the branding: 1 when an administrator entitled them, 0
-- otherwise, and 0 for every row written before this column.
ALTER TABLE users ADD COLUMN unbranded_exports INTEGER NOT NULL DEFAULT 0 CHECK (unbranded_exports IN (0, 1));

-- The administrator (their `sub`) who last set or revoked the flag; NULL until one does.
ALTER TABLE users ADD COLUMN unbranded_exports_by TEXT;

-- When the flag was last set or revoked, as ISO-8601 text in UTC; NULL until then.
ALTER TABLE users ADD COLUMN unbranded_exports_at TEXT;
