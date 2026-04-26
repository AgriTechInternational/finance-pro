import { supabase } from '../supabase';

/**
 * Logs an action to the audit_trail table.
 * @param {Object} entry - { user_email, action_type, table_name, record_id, record_details }
 */
export async function logActivity({ user_email, action_type, table_name, record_id, record_details }) {
  try {
    const { error } = await supabase.from('audit_trail').insert([{
      user_email,
      action_type,
      table_name,
      record_id,
      record_details: typeof record_details === 'string' ? { msg: record_details } : record_details
    }]);
    if (error) console.error("Audit log failed:", error.message);
  } catch (err) {
    console.error("Audit logging error:", err);
  }
}

/**
 * Wrapper for logActivity using positional arguments (legacy/component support).
 */
export async function logAuditTrail(user_email, action_type, table_name, record_id, record_details) {
  return await logActivity({
    user_email,
    action_type,
    table_name,
    record_id,
    record_details
  });
}

/**
 * Requests deletion of a record (Admin action).
 */
export async function requestDeletion(tableName, recordId, userEmail) {
  const { error } = await supabase.from(tableName).update({
    is_delete_pending: true,
    delete_requested_by: userEmail,
    delete_requested_at: new Date().toISOString()
  }).eq('id', recordId);

  if (!error) {
    await logActivity({
      user_email: userEmail,
      action_type: 'DELETE_REQUEST',
      table_name: tableName,
      record_id: recordId,
      record_details: `Deletion requested for record in ${tableName}`
    });
  }
  return { error };
}

/**
 * Approves deletion (Superuser action).
 */
export async function approveDeletion(tableName, recordId, userEmail) {
  const { error } = await supabase.from(tableName).update({
    is_delete_pending: false, // reset pending flag
    deleted_at: new Date().toISOString()
  }).eq('id', recordId);

  if (!error) {
    await logActivity({
      user_email: userEmail,
      action_type: 'DELETE_APPROVED',
      table_name: tableName,
      record_id: recordId,
      record_details: `Deletion approved for record in ${tableName}`
    });
  }
  return { error };
}

/**
 * Rejects deletion (Superuser action).
 */
export async function rejectDeletion(tableName, recordId, userEmail) {
  const { error } = await supabase.from(tableName).update({
    is_delete_pending: false,
    delete_requested_by: null,
    delete_requested_at: null
  }).eq('id', recordId);

  if (!error) {
    await logActivity({
      user_email: userEmail,
      action_type: 'DELETE_REJECTED',
      table_name: tableName,
      record_id: recordId,
      record_details: `Deletion rejected for record in ${tableName}`
    });
  }
  return { error };
}
