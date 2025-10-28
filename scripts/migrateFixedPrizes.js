// Migration script: migrate existing tournaments from prizes.fixed '1st'..'5th' style
// to prizes.fixed.amounts array (index 0 => 1st, index 1 => 2nd, ...)

const dbconnect = require('../config/dbconnect');
const Tournament = require('../models/Tournament');

(async () => {
  try {
    await dbconnect();

    const labels = ['1st', '2nd', '3rd', '4th', '5th'];

    // Find tournaments that have prizes.fixed but no amounts array
    const tournaments = await Tournament.find({ 'prizes.fixed': { $exists: true } }).lean();

    console.log(`Found ${tournaments.length} tournaments with prizes.fixed`);

    let updated = 0;

    for (const t of tournaments) {
      try {
        const fixed = (t.prizes && t.prizes.fixed) ? t.prizes.fixed : null;
        if (!fixed) continue;

        if (Array.isArray(fixed.amounts)) {
          // already migrated
          continue;
        }

        // Build amounts array from legacy keys if present
        const newAmounts = labels.map(lbl => {
          const val = fixed[lbl];
          return typeof val !== 'undefined' ? (parseFloat(val) || 0) : 0;
        });

        // If all zeros and no additional, skip unless explicit legacy keys exist
        const legacyKeysExist = labels.some(lbl => typeof fixed[lbl] !== 'undefined');
        if (!legacyKeysExist) {
          // Nothing to migrate for this tournament
          continue;
        }

        // Prepare update: set amounts and unset legacy keys
        const unsetObj = {};
        labels.forEach(lbl => { unsetObj[`prizes.fixed.${lbl}`] = ""; });

        const update = {
          $set: { 'prizes.fixed.amounts': newAmounts }
        };

        update.$unset = unsetObj;

        const res = await Tournament.updateOne({ _id: t._id }, update);

        if (res.modifiedCount && res.modifiedCount > 0) {
          updated++;
          console.log(`Migrated tournament ${t._id} -> amounts: ${JSON.stringify(newAmounts)}`);
        } else {
          console.log(`No update performed for ${t._id}`);
        }

      } catch (innerErr) {
        console.error(`Error migrating tournament ${t._id}:`, innerErr);
      }
    }

    console.log(`Migration complete. Updated ${updated} tournaments.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
