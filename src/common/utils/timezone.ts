interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const value = parts(date, timeZone);
  const asUtc = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  let result = new Date(guess.getTime() - offsetMs(guess, timeZone));
  result = new Date(guess.getTime() - offsetMs(result, timeZone));
  return result;
}

export function zonedDayRange(reference: Date, timeZone: string): { start: Date; end: Date } {
  const current = parts(reference, timeZone);
  const start = localMidnightUtc(current.year, current.month, current.day, timeZone);
  const tomorrowLocal = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const tomorrowParts = {
    year: tomorrowLocal.getUTCFullYear(),
    month: tomorrowLocal.getUTCMonth() + 1,
    day: tomorrowLocal.getUTCDate(),
  };
  const end = localMidnightUtc(tomorrowParts.year, tomorrowParts.month, tomorrowParts.day, timeZone);
  return { start, end };
}

export function zonedMonthRange(reference: Date, timeZone: string): { start: Date; end: Date } {
  const current = parts(reference, timeZone);
  const start = localMidnightUtc(current.year, current.month, 1, timeZone);
  const nextMonth = new Date(Date.UTC(current.year, current.month, 1));
  const end = localMidnightUtc(
    nextMonth.getUTCFullYear(),
    nextMonth.getUTCMonth() + 1,
    1,
    timeZone,
  );
  return { start, end };
}
