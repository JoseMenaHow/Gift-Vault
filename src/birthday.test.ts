import { describe, expect, it } from 'vitest';
import {
  findUnboughtUpcomingBirthdays,
  findUpcomingBirthdays,
  getBirthdayPlanning,
  isBirthdayGiftBought,
} from './birthday';
import type { Person } from './types';

function person(id: string, name: string, birthday?: string): Person {
  return { id, name, birthday };
}

describe('findUpcomingBirthdays', () => {
  it('includes today and the thirtieth day, sorted nearest first', () => {
    const people = [
      person('later', 'Later', '02-14'),
      person('today', 'Today', '01-15'),
      person('outside', 'Outside', '02-15'),
      person('soon', 'Soon', '01-18'),
    ];

    const upcoming = findUpcomingBirthdays(people, new Date(2026, 0, 15), 30);

    expect(upcoming.map(({ person: upcomingPerson, daysAway }) => (
      [upcomingPerson.id, daysAway]
    ))).toEqual([
      ['today', 0],
      ['soon', 3],
      ['later', 30],
    ]);
  });

  it('handles birthdays across the end of the year', () => {
    const people = [
      person('january', 'January', '01-03'),
      person('december', 'December', '12-31'),
    ];

    const upcoming = findUpcomingBirthdays(people, new Date(2026, 11, 30), 30);

    expect(upcoming.map(({ person: upcomingPerson, daysAway }) => (
      [upcomingPerson.id, daysAway]
    ))).toEqual([
      ['december', 1],
      ['january', 4],
    ]);
  });

  it('observes a leap-day birthday on February 28 in non-leap years', () => {
    const upcoming = findUpcomingBirthdays(
      [person('leap', 'Leap', '02-29')],
      new Date(2027, 1, 28),
      30,
    );

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].daysAway).toBe(0);
    expect(upcoming[0].nextOccurrence.getMonth()).toBe(1);
    expect(upcoming[0].nextOccurrence.getDate()).toBe(28);
  });

  it('opens planning exactly two calendar months before a year-boundary birthday', () => {
    const birthdayPerson = person('new-year', 'New Year', '01-05');

    expect(getBirthdayPlanning(birthdayPerson, new Date(2026, 10, 4))).toBeUndefined();
    const planning = getBirthdayPlanning(birthdayPerson, new Date(2026, 10, 5));

    expect(planning?.occurrenceKey).toBe('2027-01-05');
    expect(planning?.planningStarts).toEqual(new Date(2026, 10, 5));
  });

  it('treats bought status as applying only to its matching annual occurrence', () => {
    const birthdayPerson: Person = {
      ...person('annual', 'Annual', '04-12'),
      birthdayGiftBoughtFor: '2026-04-12',
    };

    const currentBirthday = getBirthdayPlanning(birthdayPerson, new Date(2026, 3, 1));
    const nextBirthday = getBirthdayPlanning(birthdayPerson, new Date(2027, 3, 1));

    expect(currentBirthday?.isBought).toBe(true);
    expect(isBirthdayGiftBought(birthdayPerson, currentBirthday!.nextOccurrence)).toBe(true);
    expect(nextBirthday?.isBought).toBe(false);
  });

  it('uses the observed leap-day date as the yearly bought occurrence', () => {
    const birthdayPerson: Person = {
      ...person('leap-bought', 'Leap Bought', '02-29'),
      birthdayGiftBoughtFor: '2027-02-28',
    };

    const planning = getBirthdayPlanning(birthdayPerson, new Date(2027, 1, 1));

    expect(planning?.occurrenceKey).toBe('2027-02-28');
    expect(planning?.isBought).toBe(true);
  });

  it('filters a handled birthday from global reminders without hiding next year', () => {
    const birthdayPerson: Person = {
      ...person('global', 'Global', '04-12'),
      birthdayGiftBoughtFor: '2026-04-12',
    };

    expect(findUnboughtUpcomingBirthdays([birthdayPerson], new Date(2026, 3, 1))).toEqual([]);
    expect(findUnboughtUpcomingBirthdays([birthdayPerson], new Date(2027, 3, 1)))
      .toHaveLength(1);
  });
});
