// FR04: ghi nhật ký thao tác quản trị (ai làm, trên đối tượng nào, giá trị cũ/mới, lý do)
async function log(db, { actorId, venueId = null, actionType, entityType, entityId, oldValues = null, newValues = null, reason = null }) {
  await db.query(
    `INSERT INTO audit_logs (actor_id, venue_id, action_type, entity_type, entity_id, old_values, new_values, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [actorId, venueId, actionType, entityType, entityId,
      oldValues && JSON.stringify(oldValues), newValues && JSON.stringify(newValues), reason],
  );
}

module.exports = { log };
