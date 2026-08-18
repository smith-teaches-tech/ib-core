// Whether the unauthenticated dev identity-switcher is allowed to work.
//
// The rule this replaces was `NODE_ENV !== 'production'`, which was right for a
// laptop and wrong for a shared demo: Vercel builds as production, so the
// switcher 404'd and the deployment was unusable for showing anyone anything.
//
// Gating on an explicit variable instead keeps the default closed — a production
// deploy with no env var set behaves exactly as before — while letting one
// setting open a demo. Turning the demo off is deleting a variable in the Vercel
// dashboard, not editing code and redeploying.
//
// ⚠ IB_DEMO_MODE MUST NOT BE SET ONCE REAL CANDIDATE DATA EXISTS. It permits
// anyone holding the URL to sign in as any user, and the district coordinator
// reads candidate identifiers and results PINs. With fixtures that is a demo;
// with one real student it is a safeguarding incident. This whole file, both
// /api/dev routes and DEV_USERS are deleted together when Google Sign-In lands.
//
// Deliberately NOT prefixed NEXT_PUBLIC_: nothing in the browser needs to know,
// and a public variable is one careless import away from shipping the flag to
// the client bundle.

export function demoMode(): boolean {
  return process.env.IB_DEMO_MODE === '1' || process.env.NODE_ENV !== 'production'
}
