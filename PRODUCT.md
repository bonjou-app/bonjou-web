# Bonjou Web product context

register: brand

## Product Purpose

Bonjou provides browser sharing and a separate Go CLI for local network chat and file/folder transfer. It is meant for people in the same room, lab, classroom, office, hackathon, or workshop who need to move messages and payloads between devices without accounts or cloud drives. Browsers use an online signaling coordinator, then share directly over WebRTC. CLI users discover each other on the LAN and can share fully offline. The two clients do not currently connect to each other.

## Users

- Developers and technical teams working on the same Wi-Fi or LAN.
- Students, instructors, lab users, and workshop participants sharing files locally.
- Power users who prefer terminal workflows and want a small tool they can inspect.

## Interactive Website

The homepage lets visitors complete a real local WebRTC handoff between two
endpoints in one browser. Original samples and local files up to 2 MiB can be
offered, approved or declined, verified, and downloaded. It is a demonstration,
not discovery of a second device or a production protocol session.

Study, studio, and project scenarios load related samples into the lab. The
connection explorer explains the selected browser/CLI and network setup; its
browser check stays local and does not certify Wi-Fi reachability.

In the real app, file/folder selection, drops, and clipboard images are staged
locally before an explicit metadata offer to the selected recipients. Review,
remove, clear, and retry work before recipient approval. Staging survives
conversation changes and a trip home; incoming payloads still wait for approval.

## Brand Voice

Precise, calm, practical, and trustworthy. Bonjou should feel like a compact networking instrument, not a generic SaaS launch page. The copy should explain exactly what the tool does, how to install it, what is protected, and what is not protected.

## Strategic Principles

- Lead with the real product behavior: LAN discovery, terminal chat, file/folder transfer, metadata-first approvals.
- Use security claims only when backed by repository docs.
- Make install paths obvious for macOS, Linux, and Windows.
- Keep the page fast, readable, accessible, and credible.
- The visual system should feel engineered, restrained, and premium, with enough product texture to avoid blandness.

## Anti-References

- No generic AI landing page tropes.
- No oversized empty hero that hides the actual product.
- No fake metrics, testimonials, customer logos, or exaggerated security claims.
- No cartoonish friendliness, novelty fonts, or childish tone.
- No wall of identical cards.
