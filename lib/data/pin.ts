// One store per process, whatever webpack does with the module graph.
//
// THE PROBLEM THIS SOLVES, and it is not optional:
//
// Next.js compiles the app into more than one server module graph. A page
// rendering as a React Server Component and a `'use server'` action live in
// different webpack layers, and each layer gets its OWN instance of every module
// it imports. In a production build that means this fixture data is evaluated
// twice — so a student imported by a server action is appended to an array that
// no page ever reads.
//
// It fails silently. No error, no warning: the save simply does nothing, and the
// screen re-renders from the other copy looking exactly as it did before. It
// cost an hour to find the first time, in CAS.
//
// Pinning the array IDENTITY on globalThis makes both instances share one array.
// The same pattern is why every Next + Prisma project pins its client this way.
//
// THIS IS A FIXTURE-ONLY PROBLEM. It disappears with the platform decision — a
// database is shared by definition, so `postgresRepository` will never call this.
// Nothing above lib/data/ knows it exists.
//
// RULE FOR ANY FUTURE MODULE: if fixture state is written at runtime, pin it.

const store = globalThis as unknown as Record<string, unknown>

export function pinned<T>(key: string, build: () => T): T {
  if (!(key in store)) store[key] = build()
  return store[key] as T
}
