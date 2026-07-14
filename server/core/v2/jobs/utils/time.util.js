import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export function getExecutionDate({
  baseDate, // YYYY-MM-DD
  time, // HH:mm
  timezone,
  isNextDay = false,
}) {
  let date = dayjs.tz(`${baseDate} ${time}`, "YYYY-MM-DD HH:mm", timezone);

  if (isNextDay) {
    date = date.add(1, "day");
  }

  return date.utc().toDate();
}

export function getExpectedRunAt(time, timezone, dayIndex) {
  const [hour, minute] = time.split(":");

  return dayjs()
    .tz(timezone)
    .day(dayIndex)
    .hour(hour)
    .minute(minute)
    .second(0)
    .millisecond(0);
}

export function getDelayMinutes(expectedRunAt) {
  return dayjs().diff(expectedRunAt, "minute", true);
}

export function getNowInTimeZone(timezone) {
  return dayjs().tz(timezone);
}
