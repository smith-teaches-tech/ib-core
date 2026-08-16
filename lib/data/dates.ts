// Date-only stamps in the SCHOOL's day, not UTC's.
//
// The school runs on Asia/Riyadh (UTC+3). `new Date().toISOString().slice(0,10)`
// gives UTC's date, which is yesterday for the first three hours of every Riyadh
// morning — an interview saved at 1am would be dated the day before it happened.

const RIYADH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' })

/** Today's date in Asia/Riyadh, as YYYY-MM-DD. */
export const todayRiyadh = () => RIYADH.format(new Date())

/** The Riyadh date `n` days from now, as YYYY-MM-DD. */
export const riyadhPlusDays = (n: number) => RIYADH.format(new Date(Date.now() + n * 86_400_000))
