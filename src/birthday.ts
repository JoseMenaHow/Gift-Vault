import type { Person } from './types';

export type UpcomingBirthday = {
  person: Person;
  daysAway: number;
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

export function findNextBirthday(people: Person[], now = new Date()): UpcomingBirthday | undefined {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates = people.flatMap((person) => {
    if (!person.birthday) return [];

    const [month, day] = person.birthday.split('-').map(Number);
    let nextBirthday = getBirthdayDate(today.getFullYear(), month, day);
    if (nextBirthday < today) nextBirthday = getBirthdayDate(today.getFullYear() + 1, month, day);

    const daysAway = Math.round((nextBirthday.getTime() - today.getTime()) / 86_400_000);
    return [{ person, daysAway }];
  });

  return candidates.sort((first, second) => (
    first.daysAway - second.daysAway || first.person.name.localeCompare(second.person.name)
  ))[0];
}
