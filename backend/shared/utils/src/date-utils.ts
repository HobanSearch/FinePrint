import moment from 'moment';

export const formatDate = (date: Date | string, format: string = 'YYYY-MM-DD'): string => {
  return moment(date).format(format);
};

export const isValidDate = (date: any): boolean => {
  return moment(date).isValid();
};

export const addDays = (date: Date | string, days: number): Date => {
  return moment(date).add(days, 'days').toDate();
};

export const subtractDays = (date: Date | string, days: number): Date => {
  return moment(date).subtract(days, 'days').toDate();
};

export const getDaysFromNow = (date: Date | string): number => {
  return moment(date).diff(moment(), 'days');
};

export const isExpired = (date: Date | string): boolean => {
  return moment(date).isBefore(moment());
};