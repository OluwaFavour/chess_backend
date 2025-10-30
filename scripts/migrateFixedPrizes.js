// Migration script: migrate existing tournaments from prizes.fixed '1st'..'5th' style
// to prizes.fixed.amounts array (index 0 => 1st, index 1 => 2nd, ...)

const dbconnect = require("../config/dbconnect");
const Tournament = require("../models/Tournament");

(async () => {
  try {
    await dbconnect();

    const labels = ["1st", "2nd", "3rd", "4th", "5th"];

    // Find tournaments that have prizes.fixed but no amounts array
    const tournaments = await Tournament.find({
      "prizes.fixed": { $exists: true },
    }).lean();

    console.log(`Found ${tournaments.length} tournaments with prizes.fixed`);

    let updated = 0;

    for (const t of tournaments) {
      try {
        const fixed = t.prizes && t.prizes.fixed ? t.prizes.fixed : null;
        if (!fixed) continue;

        if (Array.isArray(fixed.amounts)) {
          // already migrated
          // but still check percentage below
        }

        // Build amounts array from legacy keys if present for fixed
        const newAmounts = labels.map((lbl) => {
          const val = fixed[lbl];
          return typeof val !== "undefined" ? parseFloat(val) || 0 : 0;
        });

        // If all zeros and no additional, skip unless explicit legacy keys exist
        const legacyKeysExist = labels.some(
          (lbl) => typeof fixed[lbl] !== "undefined"
        );

        // Prepare update skeleton
        const update = { $set: {}, $unset: {} };

        if (legacyKeysExist) {
          update.$set["prizes.fixed.amounts"] = newAmounts;
          labels.forEach((lbl) => {
            update.$unset[`prizes.fixed.${lbl}`] = "";
          });
        }

        // Also migrate percentage-shaped legacy fields into prizes.percentage.amounts if present
        const pct =
          t.prizes && t.prizes.percentage ? t.prizes.percentage : null;
        if (pct && !Array.isArray(pct.amounts)) {
          const newPctAmounts = labels.map((lbl) => {
            const val = pct[lbl];
            return typeof val !== "undefined" ? parseFloat(val) || 0 : 0;
          });

          const pctLegacyExist = labels.some(
            (lbl) => typeof pct[lbl] !== "undefined"
          );
          if (pctLegacyExist) {
            update.$set["prizes.percentage.amounts"] = newPctAmounts;
            labels.forEach((lbl) => {
              update.$unset[`prizes.percentage.${lbl}`] = "";
            });
          }
        }

        // If update has nothing to set/unset, skip
        if (
          Object.keys(update.$set).length === 0 &&
          Object.keys(update.$unset).length === 0
        ) {
          continue;
        }

        // Clean up empty objects (MongoDB driver doesn't like empty $unset or $set)
        if (Object.keys(update.$set).length === 0) delete update.$set;
        if (Object.keys(update.$unset).length === 0) delete update.$unset;

        const res = await Tournament.updateOne({ _id: t._id }, update);

        if (res.modifiedCount && res.modifiedCount > 0) {
          updated++;
          console.log(
            `Migrated tournament ${t._id} -> update: ${JSON.stringify(update)}`
          );
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
    console.error("Migration failed:", err);
    process.exit(1);
  }
})();
