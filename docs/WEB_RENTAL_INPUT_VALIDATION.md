# Web rental period validation

Public availability, quote, cart, and booking requests must include full
timezone-aware timestamps for both rental start and end. Date-only values such
as `2026-10-23` are rejected. The storefront sends Vietnam local time with an
explicit `+07:00` offset; the API validates the instants and stores them as
`TIMESTAMPTZ`.

The end must be later than the start. Duration is calculated from the rental
instants using the shared rental rules. The online maximum duration is enforced
for storefront requests; manual Admin bookings use the same timestamp format
without that online-only cap.

Validation happens before repository access and again at the booking persistence
boundary. Date-only parsing is not used as a compatibility fallback.
