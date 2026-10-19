import type { Person } from './types';

export type UpcomingBirthday = {
  person: Person;
  daysAway: number;
  nextOccurrence: Date;
};

export type BirthdayPlanning = UpcomingBirthday & {
  planningStarts: Date;
  occurrenceKey: string;
  isBought: boolean;
};

function getBirthdayDate(year: number, month: number, day: number): Date {
  const birthday = new Date(year, month - 1, day);

  if (month === 2 && day === 29 && birthday.getMonth() !== 1) {
    return new Date(year, 1, 28);
  }

  return birthday;
}

export function toBirthdayInputValue(birthday?: string): string {
  return birthday ? `2000-${birthday}` : '';
}

export function getBirthdayFromInput(value: string): string | undefined {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}-${match[2]}` : undefined;
}

export function formatBirthday(birthday: string): string {
  const [month, day] = birthday.split('-').map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function getCalendarDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function getNextBirthday(person: Person, today: Date): UpcomingBirthday | undefined {
  if (!person.birthday) return undefined;

  const [month, day] = person.birthday.split('-').map(Number);
  let nextOccurrence = getBirthdayDate(today.getFullYear(), month, day);
  if (nextOccurrence < today) nextOccurrence = getBirthdayDate(today.getFullYear() + 1, month, day);

  return {
    person,
    nextOccurrence,
    daysAway: getCalendarDayNumber(nextOccurrence) - getCalendarDayNumber(today),
  };
}

function subtractCalendarMonths(date: Date, months: number): Date {
  const targetMonthIndex = date.getMonth() - months;
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  return new Date(targetYear, targetMonth, Math.min(date.getDate(), lastDayOfTargetMonth));
}

export function getBirthdayOccurrenceKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function isBirthdayGiftBought(person: Person, nextOccurrence: Date): boolean {
  return person.birthdayGiftBoughtFor === getBirthdayOccurrenceKey(nextOccurrence);
}

export function getBirthdayPlanning(person: Person, now = new Date()): BirthdayPlanning | undefined {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = getNextBirthday(person, today);
  if (!upcoming) return undefined;

  const planningStarts = subtractCalendarMonths(upcoming.nextOccurrence, 2);
  if (today < planningStarts) return undefined;

  return {
    ...upcoming,
    planningStarts,
    occurrenceKey: getBirthdayOccurrenceKey(upcoming.nextOccurrence),
    isBought: isBirthdayGiftBought(person, upcoming.nextOccurrence),
  };
}

export function findUpcomingBirthdays(
  people: Person[],
  now = new Date(),
  windowDays = 30,
): UpcomingBirthday[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates = people.flatMap((person) => {
    const upcoming = getNextBirthday(person, today);
    return upcoming && upcoming.daysAway <= windowDays ? [upcoming] : [];
  });

  return candidates.sort((first, second) => (
    first.daysAway - second.daysAway
      || first.nextOccurrence.getTime() - second.nextOccurrence.getTime()
      || first.person.name.localeCompare(second.person.name)
  ));
}

export function findUnboughtUpcomingBirthdays(
  people: Person[],
  now = new Date(),
  windowDays = 30,
): UpcomingBirthday[] {
  return findUpcomingBirthdays(people, now, windowDays)
    .filter(({ person, nextOccurrence }) => !isBirthdayGiftBought(person, nextOccurrence));
}

export function findNextBirthday(people: Person[], now = new Date()): UpcomingBirthday | undefined {
  return findUpcomingBirthdays(people, now, 366)[0];
}
