# Bonjou Web revamp implementation

The user approved the full design and authorized implementation and testing.
Follow the corresponding 2026-09-11 design spec and repository invariants.

1. Repair download completion and cancellation, add authenticated-worker
   regression coverage, and retain the unchanged protocol v2 framing.
2. Repair room feedback/navigation, unread visibility, failed drafts,
   transfer history, tab acquisition, and connection troubleshooting.
3. Revamp the workspace and onboarding using the installed shadcn/Radix
   controls. Cover all states and both themes at desktop and mobile sizes.
4. Revamp the landing page and installation flow. Split route code and
   remove unnecessary initial dependencies without resetting sessions.
5. Build and render the nearby-device scene in Blender with real interface
   screenshots, realistic materials and lighting, and optimized image assets.
6. Run browser workflows, protocol tests, Go tests, build, accessibility and
   responsive checks. Diagnose default-browser discovery separately from any
   explicitly configured test harness. Fix failures and review the result.
7. Update DESIGN.md and the verification report with actual changes, measured
   results, visual evidence, and remaining environment limitations.

Keep existing uncommitted work. No release version change or deployment is
needed for this task. No new top-level directory or second component system.

Implementation completed and locally verified on 2026-09-11. See
`../reports/2026-09-11-bonjou-web-verification.md` for measured results, browser
coverage, visual evidence, and physical-device validation limits.
