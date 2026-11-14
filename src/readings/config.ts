// Every adjustable number of the data layer, in one place.
// TODO(flight-surgeon) marks numbers that need expert input before any real use. None of them is a clinical limit.

export const READINGS_CONFIG = {
  bpCalibration: {
    /** A cuff calibration older than this is "stale" and the display says "needs calibration". */
    staleAfterDays: 30, // TODO(flight-surgeon): how long a cuff calibration stays valid for a cuffless trend
  },
  glucoseSensor: {
    /** After a sensor starts, readings are "calibrating" for this long. */
    warmupMinutes: 60, // TODO(flight-surgeon): depends on the exact CGM model (check the manufacturer's value)
    /** The simulated sensor was applied this many days before the scenario clock starts. */
    simulatedSensorAgeDays: 4,
  },
  context: {
    /** "Resting" for baselines: at least this many minutes since the last exercise. */
    restingMinMinutesSinceExercise: 60, // TODO(flight-surgeon)
    /** "Just exercised" for baselines: at most this many minutes since the last exercise. */
    postExerciseMaxMinutes: 60, // TODO(flight-surgeon)
  },
  reference: {
    /** A data-derived reference band is used only if it is based on at least this many people. */
    minSampleN: 10, // TODO(flight-surgeon)
  },
  baseline: {
    /** Personal sessions needed before the personal baseline replaces the population reference. */
    minSessions: 7, // TODO(flight-surgeon)
    /** The personal range is median +/- k x (1.4826 x MAD). */
    rangeK: 2, // TODO(flight-surgeon)
    madScale: 1.4826,
    /** MAD floor as a fraction of the median, so a very steady history does not give a razor-thin range. */
    minRelMad: 0.03, // TODO(flight-surgeon)
  },
  glucose: {
    /** Placeholder "in range" band for healthy adults. NOT a diabetes threshold. */
    bandLowMgDl: 70, // TODO(flight-surgeon)
    bandHighMgDl: 140, // TODO(flight-surgeon)
  },
  mental: {
    /** Survey score (percent) at or above this is Good, from the next value up to here is Watch, below is Check-in and "talk to someone". */
    goodMin: 50, // TODO(flight-surgeon): WHO-5 convention, not validated for astronauts
    watchMin: 29, // TODO(flight-surgeon): WHO-5 convention (28 or lower = very low), not validated for astronauts
  },
  sleep: {
    /** Nights needed before a trend against the personal baseline is shown. */
    minNightsForTrend: 3, // TODO(flight-surgeon)
  },
} as const;
