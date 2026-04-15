/**
 * Validierungsfunktionen für Formulare
 * Wiederverwendbar in Register.tsx und ProjektFormular.tsx
 */

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-\(\)\+\/]/g, '');
  return /^\d{6,15}$/.test(cleaned);
}

export function isValidUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidZip(zip: string): boolean {
  if (!zip) return true;
  return /^\d{4,5}$/.test(zip.trim());
}

export function isValidName(name: string): boolean {
  if (!name) return false;
  return name.trim().length >= 2 && /^[\p{L}\s\-']+$/u.test(name.trim());
}

export function isValidPassword(password: string): boolean {
  if (!password) return false;
  return password.length >= 8 && /\d/.test(password);
}

export function isDateInFuture(dateString: string): boolean {
  if (!dateString) return true;
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

export function hasMinLength(value: string, minLength: number): boolean {
  if (!value) return false;
  return value.trim().length >= minLength;
}

export interface ValidationErrors {
  [field: string]: string | undefined;
}

export function validateField(
  value: string,
  validators: Array<{ check: (v: string) => boolean; message: string }>
): string | undefined {
  for (const { check, message } of validators) {
    if (!check(value)) {
      return message;
    }
  }
  return undefined;
}
