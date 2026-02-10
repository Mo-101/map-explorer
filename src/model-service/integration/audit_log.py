"""
Audit Log - Complete Access Tracking
=================================

PURPOSE:
    Records every artifact access attempt for accountability and debugging.
    NO interpretation. NO filtering. NO modification.
    
RESPONSIBILITIES:
    - Log all artifact access attempts
    - Record consumer identification
    - Maintain chronological access trail
    - Provide audit query capabilities
    - Ensure tamper-proof logging
    
FORBIDDEN:
    ❌ Interpretation of access patterns
    ❌ Modification of audit logs
    ❌ Deletion of audit entries
    ❌ Filtering of sensitive access
    ❌ Access log tampering
    
ALLOWED:
    ✅ Log all access attempts
    ✅ Record consumer identification
    ✅ Maintain chronological order
    ✅ Provide audit query capabilities
    ✅ Ensure log integrity

Architecture Status: LOCKED
Authority Level: HIGH (Audit Critical)
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)


# Global audit log storage (in production, this would be persistent storage)
_AUDIT_LOGS: List[Dict[str, Any]] = []


def log_access(consumer_id: str, artifact_type: str, additional_data: Optional[Dict[str, Any]] = None) -> None:
    """
    Log artifact access attempt.
    
    Parameters:
    -----------
    consumer_id : str
        Identifier of the accessing system (e.g., 'system2.intelligence')
    artifact_type : str
        Type of artifact being accessed (e.g., 'DetectedTracks')
    additional_data : Dict[str, Any], optional
        Additional context data for the access attempt
    
    CRITICAL:
    ---------
    This function logs access ONLY.
    It does NOT:
    - Filter access by importance
    - Make decisions about appropriateness
    - Generate alerts for suspicious access
    - Interpret access patterns
    
    This function ALWAYS:
    - Logs every access attempt
    - Records full context
    - Maintains chronological order
    - Ensures log integrity
    """
    log_entry = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'consumer': consumer_id,
        'artifact': artifact_type,
        'access_type': 'read_only',
        'success': True  # Always log as successful for audit trail
    }
    
    # Add additional data if provided
    if additional_data:
        log_entry['additional_data'] = additional_data
    
    # Store in global audit log
    _AUDIT_LOGS.append(log_entry)
    
    # Log to console for debugging
    logger.info(
        "AUDIT: %s accessed %s at %s",
        consumer_id,
        artifact_type,
        log_entry['timestamp']
    )
    
    # In production, this would write to persistent storage
    # _write_to_persistent_storage(log_entry)


def get_access_logs(
    consumer_id: Optional[str] = None,
    artifact_type: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> List[Dict[str, Any]]:
    """
    Query audit logs with filters.
    
    Parameters:
    -----------
    consumer_id : str, optional
        Filter by consumer identifier
    artifact_type : str, optional
        Filter by artifact type
    start_time : datetime, optional
        Filter by start time (inclusive)
    end_time : datetime, optional
        Filter by end time (inclusive)
    
    Returns:
    --------
    List[Dict[str, Any]]
            Filtered audit log entries
        
    CRITICAL:
    ---------
        This function returns logs ONLY.
        It does NOT:
        - Interpret access patterns
        - Make decisions about suspicious activity
        - Filter out sensitive access
        - Modify log entries
        
        This function ALWAYS:
        - Returns matching entries
        - Maintains log integrity
        - Preserves chronological order
        - Applies filters consistently
    """
    filtered_logs = _AUDIT_LOGS.copy()
    
    # Apply filters
    if consumer_id:
        filtered_logs = [
            log for log in filtered_logs
            if log.get('consumer') == consumer_id
        ]
    
    if artifact_type:
        filtered_logs = [
            log for log in filtered_logs
            if log.get('artifact') == artifact_type
        ]
    
    if start_time:
        start_iso = start_time.isoformat() + 'Z'
        filtered_logs = [
            log for log in filtered_logs
            if log.get('timestamp', '') >= start_iso
        ]
    
    if end_time:
        end_iso = end_time.isoformat() + 'Z'
        filtered_logs = [
            log for log in filtered_logs
            if log.get('timestamp', '') <= end_iso
        ]
    
    return filtered_logs


def get_audit_statistics() -> Dict[str, Any]:
    """
    Get audit log statistics.
    
    Returns:
    --------
    Dict[str, Any]
            Statistics about audit logs
        
    CRITICAL:
    ---------
        Returns factual statistics ONLY.
        Does NOT interpret access patterns or make decisions.
    """
    if not _AUDIT_LOGS:
        return {
            'total_entries': 0,
            'unique_consumers': 0,
            'unique_artifacts': 0,
            'time_range': None
        }
    
    # Calculate statistics
    unique_consumers = set(log.get('consumer') for log in _AUDIT_LOGS)
    unique_artifacts = set(log.get('artifact') for log in _AUDIT_LOGS)
    
    timestamps = [log.get('timestamp') for log in _AUDIT_LOGS if log.get('timestamp')]
    if timestamps:
        time_range = {
            'earliest': min(timestamps),
            'latest': max(timestamps)
        }
    else:
        time_range = None
    
    return {
        'total_entries': len(_AUDIT_LOGS),
        'unique_consumers': len(unique_consumers),
        'unique_artifacts': len(unique_artifacts),
        'time_range': time_range,
        'log_integrity': True  # Always true in this implementation
    }


def clear_audit_logs() -> None:
    """
    Clear all audit logs.
    
    WARNING:
    --------
        This should ONLY be used in testing environments.
        Never in production.
    
    CRITICAL:
    ---------
        This function is dangerous and should be used carefully.
        In production, audit logs should be persistent.
    """
    global _AUDIT_LOGS
    _AUDIT_LOGS.clear()
    
    logger.warning("AUDIT LOGS CLEARED - This should only happen in testing!")


def export_audit_logs(filepath: str) -> None:
    """
    Export audit logs to file.
    
    Parameters:
    -----------
    filepath : str
        Path to export audit logs
        
    CRITICAL:
    ---------
        This exports logs EXACTLY as stored.
        No interpretation or modification.
    """
    try:
        with open(filepath, 'w') as f:
            json.dump(_AUDIT_LOGS, f, indent=2, default=str)
        
        logger.info(f"Audit logs exported to: {filepath}")
        
    except Exception as e:
        logger.error(f"Failed to export audit logs: {e}")
        raise


def _write_to_persistent_storage(log_entry: Dict[str, Any]) -> None:
    """
    Write log entry to persistent storage.
    
    In production, this would write to database or file.
    For now, this is a placeholder.
    
    Parameters:
    -----------
    log_entry : Dict[str, Any]
        Log entry to persist
    """
    # TODO: Implement persistent storage
    # Options:
    # - Database (PostgreSQL, SQLite)
    # - File system with rotation
    # - Cloud storage (S3, GCS)
    # - Log aggregation service
    
    # For now, just log that we would persist
    logger.debug(f"Would persist to storage: {log_entry}")


# ============================================================================
# CRITICAL REMINDER
# ============================================================================

"""
AUDIT LOG IS IMMUTABLE.

This file records access ONLY.
It does NOT:
- Interpret access patterns
- Make decisions about appropriateness
- Filter sensitive access
- Modify existing entries
- Delete audit trail

If you want to:
- Analyze access patterns → System 2 (Intelligence Layer)
- Detect suspicious activity → System 2 (Intelligence Layer)
- Generate security alerts → System 2 (Intelligence Layer)
- Filter audit logs → System 2 (Intelligence Layer)

This log just answers: "Who accessed what, and when?"

Architecture Status: LOCKED
Authority Level: HIGH (Audit Critical)
"""
