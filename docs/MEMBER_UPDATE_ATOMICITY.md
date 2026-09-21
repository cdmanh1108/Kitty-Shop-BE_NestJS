# Member update atomicity

`PATCH /api/v1/admin/members/:id` resolves every supplied role code in the target
shop before it writes member state. An unknown role produces HTTP 400 with
`MEMBER_ROLE_NOT_FOUND`; the target member remains unchanged.

For a valid update, member status (when supplied), role replacement (when supplied),
and one `UPDATE` audit row are committed in one serializable transaction. Unlike the
global best-effort audit port, an audit insert failure rolls back this member update.
Omitted `roleCodes` preserve assignments; an empty role list remains invalid.
