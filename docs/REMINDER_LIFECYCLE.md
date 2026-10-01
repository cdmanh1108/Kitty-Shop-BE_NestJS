# Reminder lifecycle

A reminder row represents one logical occurrence identified by its shop-scoped `dedupeKey`. The current reminder policy builds that key from reminder type, order id and the shop-local day:

```text
<type>:<order-id>:<shop-local-day>
```

Refreshing the scheduler or the Admin refresh endpoint for the same key updates only mutable presentation and scheduling fields. It never changes lifecycle fields. Therefore the lifecycle is:

| Existing state | Same-key active refresh | Condition becomes inactive |
| --- | --- | --- |
| `PENDING` | Remains `PENDING` | Becomes `RESOLVED` |
| `DISMISSED` | Remains dismissed, with original actor/time | Remains dismissed |
| `RESOLVED` | Remains resolved, with original processed time | Remains resolved |

Dismissal suppresses only the current logical occurrence, not every reminder for an order forever. A later occurrence with a deliberately different dedupe key—normally the next shop-local day—can create a new `PENDING` row. Same-day re-opening is not currently a policy and must introduce an explicit new occurrence identity; it must not revive a terminal row.

The implementation relies on Prisma's atomic unique-key upsert and does not perform a read-then-write lifecycle decision. This preserves terminal states regardless of whether refresh or dismiss commits first. During rollout, update every scheduler-running instance promptly: an old instance still using the former lifecycle-resetting upsert can temporarily revive a dismissal. Historical rows that were already revived cannot be reconstructed safely and are not backfilled.
