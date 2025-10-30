Tournament fixed prizes schema migration

Summary

We changed the shape of `prizes.fixed` in the `Tournament` model to use an ordered `amounts` array instead of the legacy `'1st'`, `'2nd'`, `'3rd'`, `'4th'`, `'5th'` object keys.

Why

- Arrays are easier to iterate and avoid fragile property names containing punctuation.
- This simplifies aggregation and distribution logic.

What changed

- `models/Tournament.js` now defines:

  prizes.fixed:
  - amounts: [Number]     // index 0 => 1st, index 1 => 2nd, index 2 => 3rd, ...
  - additional: [{ position: Number, amount: Number }]

- Controllers updated to read/write `prizes.fixed.amounts`.
- A compatibility layer was added (post-init and pre-save hooks) so the app can read legacy documents until you migrate the DB.
- A migration script was added at `scripts/migrateFixedPrizes.js` to convert existing documents in the DB.

How to run the migration (recommended flow)

1) Backup your database (HIGHLY RECOMMENDED).

2) Test the migration on a staging/dev copy of your DB first.

3) Ensure `MONGODB_URL` is set in your environment (the same URL used to run the app):

   Powershell example:

   $env:MONGODB_URL = 'mongodb+srv://...'

4) Run the migration script from the repo root:

   npm run migrate-fixed-prizes

   - This script finds tournaments that have legacy `prizes.fixed.{1st,2nd,...}` keys, creates `prizes.fixed.amounts` from those values (index mapping: 1st->0, 2nd->1, ...), and unsets the old keys.
   - The script prints progress and a summary of how many documents were updated.

Dry-run / safety

- The current migration script updates documents in-place and attempts to unset the legacy keys. If you prefer a dry-run mode, ask and we'll add a `--dry-run` flag that will only print intended updates without writing them.

Post-migration verification

- After migration, check a few documents manually in the DB and verify they have `prizes.fixed.amounts: [ ... ]` and no `prizes.fixed.1st`..`5th` keys.
- Run the app's tournament flows (create, fetch, submit results) and ensure prize calculations & distributions work as expected.

Rollback

- If something goes wrong, restore from the DB backup made earlier.

Notes

- The codebase already includes a compatibility hook that will expose `prizes.fixed.amounts` at runtime for legacy documents, so you can deploy code changes before running the migration if you prefer a staged rollout.

Questions / next steps

- Want a dry-run option in the migration script? (I can add it.)
- Want me to make the migration idempotent and add logging to a file instead of console? (I can do that.)
