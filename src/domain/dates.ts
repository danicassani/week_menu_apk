import { Temporal } from "@js-temporal/polyfill";

export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
export function localDay(
  zone = deviceZone(),
  instant = Temporal.Now.instant(),
): string {
  return instant.toZonedDateTimeISO(zone).toPlainDate().toString();
}
export function dayAt(iso: string, zone: string): string {
  return localDay(zone, Temporal.Instant.from(iso));
}
export function dayCutoff(day: string, zone: string): string {
  return Temporal.PlainDate.from(day)
    .add({ days: 1 })
    .toZonedDateTime({ timeZone: zone, plainTime: "00:00" })
    .toInstant()
    .toString();
}
export function daysBetween(start: string, end: string): number {
  return Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end))
    .days;
}
export function addDays(day: string, amount: number): string {
  return Temporal.PlainDate.from(day).add({ days: amount }).toString();
}
export function weekDays(day: string, startsOn: 0 | 1): string[] {
  const date = Temporal.PlainDate.from(day);
  const offset = ((date.dayOfWeek % 7) - startsOn + 7) % 7;
  return Array.from({ length: 7 }, (_, i) =>
    date.add({ days: i - offset }).toString(),
  );
}
export function formatDay(
  day: string,
  language: "en" | "es",
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(day + "T12:00:00Z"));
}
