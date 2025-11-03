const mongoose = require("mongoose");
const { DateTime } = require("luxon");

const TournamentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Tournament title is required"],
    trim: true,
  },
  category: {
    type: String,
    enum: ["bullet", "blitz", "rapid", "classical", "960", "crazyhouse"],
    required: [true, "Tournament category is required"],
  },
  banner: {
    type: String,
    required: [true, "Tournament banner is required"],
  },
  rules: {
    type: String,
    required: [true, "Tournament rules are required"],
  },
  startDate: {
    type: Date,
    required: [true, "Start date is required"],
  },
  startTime: {
    type: String,
    required: [true, "Start time is required"],
    validate: {
      validator: function (v) {
        // Accept both 12-hour and 24-hour formats
        return /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i.test(v);
      },
      message: "Start time must be in HH:MM or HH:MM AM/PM format",
    },
  },
  timezone: {
    type: String,
    default: "UTC",
    required: [true, "Timezone is required"],
  },
  duration: {
    type: Number, // In milliseconds
    required: [true, "Tournament duration is required"],
  },
  prizeType: {
    type: String,
    enum: ["fixed", "percentage", "special"],
    required: [true, "Prize type is required"],
  },
  prizes: {
    fixed: {
      // Ordered amounts array: index 0 => 1st, index 1 => 2nd, etc.
      amounts: { type: [Number], default: [] },
      additional: [{ position: Number, amount: Number }],
    },
    percentage: {
      basePrizePool: { type: Number },
      // Ordered amounts array for percentage-based prizes: index 0 => 1st, index 1 => 2nd, etc.
      amounts: { type: [Number], default: [] },
      additional: [{ position: Number, percentage: Number }],
    },
    special: {
      isFixed: { type: Boolean, default: true },
      basePrizePool: { type: Number },
      specialPrizes: [
        {
          category: String,
          amount: Number,
          isPercentage: { type: Boolean, default: false },
        },
      ],
    },
  },
  entryFee: {
    type: Number,
    default: 0,
  },
  fundingMethod: {
    type: String,
    enum: ["wallet", "direct", "topup"],
    required: [true, "Funding method is required"],
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  status: {
    type: String,
    enum: ["upcoming", "active", "completed", "cancelled"],
    default: "upcoming",
  },
  manualStatusOverride: {
    type: Boolean,
    default: false,
  },
  actualStartTime: {
    type: Date,
    default: null,
  },
  actualEndTime: {
    type: Date,
    default: null,
  },
  tournamentLink: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  fiveMinuteReminderSent: {
    type: Boolean,
    default: false,
  },
});

// Helper method to normalize time format (convert 12-hour to 24-hour)
TournamentSchema.methods.normalizeTimeFormat = function (timeString) {
  try {
    if (!timeString || typeof timeString !== "string") {
      throw new Error("Invalid time string");
    }

    const timeStr = timeString.trim().toUpperCase();

    // Check if it's 12-hour format (contains AM/PM)
    if (timeStr.includes("AM") || timeStr.includes("PM")) {
      const isPM = timeStr.includes("PM");
      const timeOnly = timeStr.replace(/\s?(AM|PM)/i, "");
      const [hours, minutes] = timeOnly.split(":").map(Number);

      if (isNaN(hours) || isNaN(minutes)) {
        throw new Error("Invalid time format");
      }

      let hour24 = hours;

      // Convert 12-hour to 24-hour
      if (isPM && hours !== 12) {
        hour24 = hours + 12;
      } else if (!isPM && hours === 12) {
        hour24 = 0;
      }

      return `${hour24.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    } else {
      // Already in 24-hour format, just validate
      const [hours, minutes] = timeString.split(":").map(Number);

      if (
        isNaN(hours) ||
        isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
      ) {
        throw new Error("Invalid time values");
      }

      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }
  } catch (error) {
    console.error(`Error normalizing time format for "${timeString}":`, error);
    return null;
  }
};

// Enhanced date handling method using Luxon
TournamentSchema.methods.getStartDateTime = function () {
  try {
    // Validate inputs
    if (!this.startDate) {
      console.error(`Tournament ${this._id} has no startDate`);
      return null;
    }

    if (!this.startTime) {
      console.error(`Tournament ${this._id} has no startTime`);
      return null;
    }

    // Normalize time format (handle both 12-hour and 24-hour)
    const normalizedTime = this.normalizeTimeFormat(this.startTime);
    if (!normalizedTime) {
      console.error(
        `Tournament ${this._id} has invalid startTime format:`,
        this.startTime
      );
      return null;
    }

    // Extract date components from the original date without timezone conversion
    const startDateObj = new Date(this.startDate);
    if (isNaN(startDateObj.getTime())) {
      console.error(
        `Tournament ${this._id} has invalid startDate:`,
        this.startDate
      );
      return null;
    }

    const year = startDateObj.getFullYear();
    const month = String(startDateObj.getMonth() + 1).padStart(2, "0");
    const day = String(startDateObj.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    console.log(`Tournament ${this._id} - Processing:`);
    console.log(`  Original startDate: ${this.startDate}`);
    console.log(`  Extracted Date: ${dateString}`);
    console.log(`  Original Time: ${this.startTime}`);
    console.log(`  Normalized Time: ${normalizedTime}`);
    console.log(`  Timezone: ${this.timezone}`);

    // Handle timezone conversion using Luxon
    const timezone = this.timezone || "UTC";

    try {
      // Create datetime string in ISO format for Luxon
      const datetimeISO = `${dateString}T${normalizedTime}:00`;
      console.log(`  ISO DateTime String: ${datetimeISO}`);

      let tournamentDateTime;

      if (timezone === "UTC") {
        // Parse as UTC
        tournamentDateTime = DateTime.fromISO(datetimeISO, { zone: "UTC" });
      } else {
        // Parse in specified timezone, then convert to UTC
        tournamentDateTime = DateTime.fromISO(datetimeISO, { zone: timezone });
        console.log(
          `  Local DateTime: ${tournamentDateTime.toFormat(
            "yyyy-MM-dd HH:mm:ss"
          )} (${timezone})`
        );

        // Convert to UTC
        tournamentDateTime = tournamentDateTime.toUTC();
      }

      if (!tournamentDateTime.isValid) {
        console.error(
          `Invalid datetime created for tournament ${this._id}:`,
          tournamentDateTime.invalidReason
        );
        return null;
      }

      console.log(
        `  Final UTC DateTime: ${tournamentDateTime.toFormat(
          "yyyy-MM-dd HH:mm:ss"
        )} UTC`
      );
      console.log(`  ISO String: ${tournamentDateTime.toISO()}`);

      return tournamentDateTime.toJSDate();
    } catch (timezoneError) {
      console.error(
        `Timezone error for tournament ${this._id}:`,
        timezoneError
      );
      // Better fallback handling
      const fallbackDateTime = DateTime.fromISO(
        `${dateString}T${normalizedTime}:00`,
        { zone: "UTC" }
      );
      console.log(`  Fallback UTC DateTime: ${fallbackDateTime.toISO()}`);
      return fallbackDateTime.toJSDate();
    }
  } catch (error) {
    console.error(
      `Error calculating start date/time for tournament ${this._id}:`,
      error
    );
    return null;
  }
};

// Method to calculate end date/time
TournamentSchema.methods.getEndDateTime = function () {
  try {
    const startDateTime = this.getStartDateTime();

    if (!startDateTime) {
      console.error(`Tournament ${this._id} has no valid start date/time`);
      return null;
    }

    if (!this.duration || isNaN(this.duration)) {
      console.error(
        `Tournament ${this._id} has invalid duration:`,
        this.duration
      );
      return null;
    }

    // Add duration (in milliseconds) to start time
    const endDateTime = new Date(startDateTime.getTime() + this.duration);

    console.log(`Tournament ${this._id} end time calculation:`);
    console.log(
      `  Start time: ${DateTime.fromJSDate(startDateTime)
        .toUTC()
        .toFormat("yyyy-MM-dd HH:mm:ss")} UTC`
    );
    console.log(
      `  Duration: ${this.duration}ms (${this.duration / (1000 * 60)} minutes)`
    );
    console.log(
      `  End time: ${DateTime.fromJSDate(endDateTime)
        .toUTC()
        .toFormat("yyyy-MM-dd HH:mm:ss")} UTC`
    );

    return endDateTime;
  } catch (error) {
    console.error(
      `Error calculating end date/time for tournament ${this._id}:`,
      error
    );
    return null;
  }
};

// Method to get tournament times in user's timezone
TournamentSchema.methods.getTimesInTimezone = function (targetTimezone = null) {
  try {
    const timezone = targetTimezone || this.timezone || "UTC";
    const startDateTime = this.getStartDateTime();
    const endDateTime = this.getEndDateTime();

    if (!startDateTime || !endDateTime) {
      return null;
    }

    const startInTimezone =
      DateTime.fromJSDate(startDateTime).setZone(timezone);
    const endInTimezone = DateTime.fromJSDate(endDateTime).setZone(timezone);

    return {
      startDateTime: startInTimezone.toJSDate(),
      endDateTime: endInTimezone.toJSDate(),
      startDateTimeFormatted: startInTimezone.toFormat("yyyy-MM-dd HH:mm:ss"),
      endDateTimeFormatted: endInTimezone.toFormat("yyyy-MM-dd HH:mm:ss"),
      timezone: timezone,
    };
  } catch (error) {
    console.error(
      `Error getting times in timezone for tournament ${this._id}:`,
      error
    );
    return null;
  }
};

// Method to check if tournament is starting within specified minutes
TournamentSchema.methods.isStartingWithinMinutes = function (minutes) {
  try {
    const startDateTime = this.getStartDateTime();
    if (!startDateTime) return false;

    const now = DateTime.utc();
    const start = DateTime.fromJSDate(startDateTime).toUTC();
    const diffInMinutes = start.diff(now, "minutes").minutes;

    return diffInMinutes > 0 && diffInMinutes <= minutes;
  } catch (error) {
    console.error(
      `Error checking start time for tournament ${this._id}:`,
      error
    );
    return false;
  }
};

// Virtual field to calculate real-time status
TournamentSchema.virtual("currentStatus").get(function () {
  if (this.manualStatusOverride || this.status === "cancelled") {
    return this.status;
  }

  const now = DateTime.utc();
  const startDateTime = this.getStartDateTime();
  const endDateTime = this.getEndDateTime();

  if (!startDateTime || !endDateTime) {
    console.warn(`Tournament ${this._id} has invalid date/time data`);
    return this.status;
  }

  const startLuxon = DateTime.fromJSDate(startDateTime).toUTC();
  const endLuxon = DateTime.fromJSDate(endDateTime).toUTC();

  console.log(`Tournament ${this._id} status calculation:`);
  console.log(`  Current time: ${now.toFormat("yyyy-MM-dd HH:mm:ss")} UTC`);
  console.log(
    `  Start time: ${startLuxon.toFormat("yyyy-MM-dd HH:mm:ss")} UTC`
  );
  console.log(`  End time: ${endLuxon.toFormat("yyyy-MM-dd HH:mm:ss")} UTC`);
  console.log(
    `  Minutes until start: ${startLuxon.diff(now, "minutes").minutes}`
  );
  console.log(`  Minutes until end: ${endLuxon.diff(now, "minutes").minutes}`);

  if (now < startLuxon) {
    console.log(`  Status: upcoming (current time is before start)`);
    return "upcoming";
  } else if (now >= startLuxon && now <= endLuxon) {
    console.log(`  Status: active (current time is between start and end)`);
    return "active";
  } else {
    console.log(`  Status: completed (current time is after end)`);
    return "completed";
  }
});

// Method to update status based on current time
TournamentSchema.methods.updateStatusBasedOnTime = function () {
  if (!this.manualStatusOverride && this.status !== "cancelled") {
    try {
      const calculatedStatus = this.currentStatus;
      const previousStatus = this.status;

      console.log(
        `Tournament ${this._id} status check: ${previousStatus} → ${calculatedStatus}`
      );

      if (this.status !== calculatedStatus) {
        this.status = calculatedStatus;

        const now = DateTime.utc().toJSDate();

        if (
          calculatedStatus === "active" &&
          previousStatus === "upcoming" &&
          !this.actualStartTime
        ) {
          this.actualStartTime = now;
          console.log(
            `Tournament ${this._id} started at ${DateTime.fromJSDate(
              now
            ).toFormat("yyyy-MM-dd HH:mm:ss")} UTC`
          );
        } else if (
          calculatedStatus === "completed" &&
          previousStatus === "active" &&
          !this.actualEndTime
        ) {
          this.actualEndTime = now;
          console.log(
            `Tournament ${this._id} ended at ${DateTime.fromJSDate(
              now
            ).toFormat("yyyy-MM-dd HH:mm:ss")} UTC`
          );
        }

        console.log(
          `Tournament ${this._id} status updated from ${previousStatus} to ${calculatedStatus}`
        );
        return true;
      } else {
        console.log(`Tournament ${this._id} status remains ${this.status}`);
      }
    } catch (error) {
      console.error(`Error updating status for tournament ${this._id}:`, error);
    }
  }
  return false; // No update needed
};

// Pre-save hook to update status automatically
TournamentSchema.pre("save", function (next) {
  try {
    this.updateStatusBasedOnTime();
    next();
  } catch (error) {
    console.error(`Error in pre-save hook for tournament ${this._id}:`, error);
    next(error);
  }
});

// Ensure virtual fields are included in JSON output
TournamentSchema.set("toJSON", { virtuals: true });
TournamentSchema.set("toObject", { virtuals: true });

// Backwards-compatibility: when a document is loaded, populate fixed.amounts from
// legacy keys ('1st','2nd',...) if amounts is missing. Also normalize before save.
TournamentSchema.post("init", function (doc) {
  try {
    if (!doc || !doc.prizes || !doc.prizes.fixed) return;
    const fixed = doc.prizes.fixed;
    if (Array.isArray(fixed.amounts)) return; // already present

    const labels = ["1st", "2nd", "3rd", "4th", "5th"];
    const amounts = [];
    // Build amounts only for legacy keys that exist (do not pad to a fixed length)
    labels.forEach((lbl) => {
      if (typeof fixed[lbl] !== "undefined") {
        amounts.push(Number(fixed[lbl]) || 0);
      }
    });

    if (amounts.length > 0) {
      // Attach amounts array in-memory for compatibility with code reading fixed.amounts
      fixed.amounts = amounts;
      doc.prizes.fixed = fixed;
    }
    doc.prizes.fixed = fixed;

    // Also support legacy percentage keys ('1st'..'5th') by populating prizes.percentage.amounts
    try {
      if (doc.prizes.percentage) {
        const pct = doc.prizes.percentage;
        if (!Array.isArray(pct.amounts)) {
          const pctAmounts = [];
          labels.forEach((lbl) => {
            if (typeof pct[lbl] !== "undefined") {
              pctAmounts.push(Number(pct[lbl]) || 0);
            }
          });
          if (pctAmounts.length > 0) {
            pct.amounts = pctAmounts;
            doc.prizes.percentage = pct;
          }
        }
      }
    } catch (inner) {
      console.error(
        "Tournament compatibility post-init (percentage) error:",
        inner
      );
    }
  } catch (err) {
    console.error("Tournament compatibility post-init error:", err);
  }
});

// Ensure any legacy-shaped document is normalized before saving to DB
TournamentSchema.pre("save", function (next) {
  try {
    if (this.prizes && this.prizes.fixed) {
      const fixed = this.prizes.fixed;
      if (!Array.isArray(fixed.amounts)) {
        const labels = ["1st", "2nd", "3rd", "4th", "5th"];
        const amounts = [];
        labels.forEach((lbl) => {
          if (typeof fixed[lbl] !== "undefined") {
            amounts.push(Number(fixed[lbl]) || 0);
          }
        });
        if (amounts.length > 0) {
          fixed.amounts = amounts;
          this.prizes.fixed = fixed;
        }
      }
    }
    // Normalize percentage-shaped legacy fields into percentage.amounts
    if (this.prizes && this.prizes.percentage) {
      const pct = this.prizes.percentage;
      if (!Array.isArray(pct.amounts)) {
        const labels = ["1st", "2nd", "3rd", "4th", "5th"];
        const pctAmounts = [];
        labels.forEach((lbl) => {
          if (typeof pct[lbl] !== "undefined") {
            pctAmounts.push(Number(pct[lbl]) || 0);
          }
        });
        if (pctAmounts.length > 0) {
          pct.amounts = pctAmounts;
          this.prizes.percentage = pct;
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Tournament", TournamentSchema);
