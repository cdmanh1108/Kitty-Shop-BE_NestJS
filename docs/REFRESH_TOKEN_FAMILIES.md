# Refresh-token families

Admin (`refresh_tokens`) and storefront (`web_refresh_tokens`) refresh credentials are opaque 384-bit values. Only their SHA-256 hashes are stored.

Each login creates one refresh-token family and its initial token. Rotation consumes the current token, records `ROTATED` plus `consumed_at`, and creates one replacement with the same `family_id` and `parent_token_id`. The unique parent-token constraint prevents forks.

If a non-expired token already consumed by rotation is submitted in a later transaction, the repository marks the family `REUSE_DETECTED`, records `reuse_detected_at`, and revokes every active token in that family as `FAMILY_COMPROMISED`. Login must then occur again.

Rotation runs in one Serializable transaction with a row lock. A serialization conflict from two genuinely concurrent refresh attempts is rejected without compromising the family; exactly one request can issue a replacement. This preserves the browser client's refresh deduplication and does not introduce a replay grace period.

Logout marks only its presented current token `LOGOUT`; it does not compromise sibling sessions. Admin password change revokes every active admin family and token with `PASSWORD_CHANGED`. Expired, manually logged-out, legacy-invalidated, and already-compromised tokens are rejected without creating a new reuse event.

Migration `202609280001_refresh_token_families` invalidates all refresh tokens that existed before lineage was available (`LEGACY_INVALIDATED`). Existing users sign in again; the migration does not infer or merge families from ambiguous historical `revoked_at` values.
