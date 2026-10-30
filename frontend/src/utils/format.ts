// Display helpers. They only format values for the screen, never calculate with them.

// "125.50" → "₹125.50", "125000" → "₹1,25,000.00" (Indian grouping)
const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

export function formatMoney(amount: string): string {
  const value = Number(amount)
  return moneyFormatter.format(value)
}

// "2026-03-12" (a calendar date, no time) → "12 Mar 2026". Read and shown in UTC so it never shifts a day.
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return dateFormatter.format(date)
}

// An ISO timestamp (submittedAt, decidedAt…) → "12 Mar 2026, 3:45 pm" in the viewer's own time zone
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDateTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return '—'
  }
  const date = new Date(isoTimestamp)
  return dateTimeFormatter.format(date)
}

// Enum value → label: "PENDING_APPROVAL" → "Pending approval", "OFFICE_SUPPLIES" → "Office supplies"
export function enumLabel(value: string): string {
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Today as "YYYY-MM-DD" in UTC (the backend rejects line-item dates after today in UTC)
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}
