# Activity catalogue: first import

`src/data/activities.json` contains 24 source-coded activity/pace/intensity records. `supabase/migrations/202611030002_activities.sql` imports the same records. Both preserve published MET values, numeric activity codes as strings (including leading zeroes), source descriptions, bilingual display labels, age coverage and source links. Labels translate and, where helpful, convert published speeds to metric display; they do not change MET values.

Source: **2024 Adult Compendium of Physical Activities**, for adults **19–59 years**. Citation: Herrmann SD et al. _2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities_. Journal of Sport and Health Science. 2024;13(1):6–12. Source and reuse guidance: <https://pacompendium.com/>. The Compendium permits use with acknowledgement; no copied recipe or commercial nutrition service is required.

Imported source categories:

- [Walking](https://pacompendium.com/walking/): walking pace choices and general hiking.
- [Running](https://pacompendium.com/running/): general jogging and two running speeds.
- [Bicycling](https://pacompendium.com/bicycling/): three outdoor speed bands and three stationary wattage bands.
- [Conditioning exercise](https://pacompendium.com/conditioning-exercise/): strength, yoga, Pilates, rowing, elliptical and calisthenics choices.

This is curated initial coverage, not the entire Compendium. The server accepts only published codes in the imported table and uses its own stored MET value; clients cannot supply a substitute MET. Durations must be positive and total at most 1,440 minutes for a date. Logged source METs are stored with the entry for history.

## Explicit coverage gaps

Profiles remain available to all adults aged 18+. This particular catalogue does **not** supply an estimate for age 18 or 60+, and activity logging clearly reports that gap. Those members continue to use their selected usual activity multiplier. We have not assigned Adult Compendium values to unsupported ages.

The Older Adult Compendium uses an age-specific MET convention. Importing those values directly into the confirmed standard `max(MET − 1, 0) × kg × hours` formula would require an explicit methodological decision. No such conversion is invented here. Filling age/activity gaps is a content follow-up before a household with those needs uses logged-activity overrides.

Activity expenditure is a clearly labelled estimate. A logged date replaces its usual multiplier with resting estimate × 1.2 plus net source activity energy. It does not change the accepted intake target; removing the last activity restores the usual multiplier. Formula version: `mifflin-net-met-v1`.
