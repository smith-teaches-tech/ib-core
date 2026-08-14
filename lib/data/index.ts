// The single line that changes when the platform decision lands.
//
//   Today:      fixtureRepository        (no cloud, no database, runs on a laptop)
//   Supabase:   postgresRepository       (implement Repository against Postgres)
//   Firebase:   firestoreRepository      (implement Repository against Firestore)
//
// Nothing else in the app should need to change.

import { fixtureRepository } from './fixtures'
import type { Repository } from './repository'

export const repo: Repository = fixtureRepository
export type { Repository }
