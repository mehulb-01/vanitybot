/**
 * Formatting utilities for numbers and currency.
 * Forces 'en-US' locale to ensure standard international 3-digit comma grouping (thousands/millions/billions),
 * preventing host-system locales (e.g. en-IN) from formatting numbers in 2-digit increments (lakhs/crores).
 */

const numberFormatter = new Intl.NumberFormat('en-US');

/**
 * Formats a number or bigint with comma separators (e.g. 1,000,000).
 */
export function formatNumber(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0';
  }
  return numberFormatter.format(Number(value));
}

/**
 * Formats a currency value with dollar sign prefix (e.g. $1,000,000).
 */
export function formatCurrency(value: number | bigint | null | undefined): string {
  return `$${formatNumber(value)}`;
}
