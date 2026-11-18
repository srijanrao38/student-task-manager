"""Tools the AI agent can call. Gemini reads the docstrings and type hints as tool descriptions.

Note: no `from __future__ import annotations` here, the Gemini SDK needs real type objects.
There is deliberately no delete tool.
"""
import contextvars
from datetime import date, datetime

from django.contrib.auth.models import User

from .models import Task

# The view sets this to the resolved user for the duration of one agent request.
current_user = contextvars.ContextVar("agent_current_user", default=None)

PRIORITIES = [c[0] for c in Task.PRIORITY_CHOICES]
STATUSES = [c[0] for c in Task.STATUS_CHOICES]


def _user():
    # Same resolution as the existing task views: request user, else the first user.
    return current_user.get() or User.objects.first()


def _task_dict(task):
    return {
        "id": task.id,
        "title": task.title,
        "subject": task.subject,
        "due_date": str(task.due_date),
        "priority": task.priority,
        "status": task.status,
    }


def _check_date(value):
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return None
    except (TypeError, ValueError):
        return f"due_date must be YYYY-MM-DD, got '{value}'"


def get_today_date() -> dict:
    """Return today's date as YYYY-MM-DD and the weekday name. Call this before resolving relative dates like 'Friday' or 'next week'."""
    today = date.today()
    return {"date": today.isoformat(), "weekday": today.strftime("%A")}


def list_tasks(status: str = "", subject: str = "") -> list:
    """List the student's tasks (max 50), soonest due first.

    Args:
        status: Optional filter, one of PENDING or COMPLETED. Empty string means all.
        subject: Optional case-insensitive subject filter. Empty string means all.
    """
    user = _user()
    if not user:
        return [{"error": "No user found"}]
    qs = Task.objects.filter(user=user)
    if status:
        status = status.upper()
        if status not in STATUSES:
            return [{"error": f"status must be one of {STATUSES}"}]
        qs = qs.filter(status=status)
    if subject:
        qs = qs.filter(subject__iexact=subject)
    return [_task_dict(t) for t in qs.order_by("due_date")[:50]]


def create_task(title: str, subject: str, due_date: str, priority: str) -> dict:
    """Create a new PENDING task and return it.

    Args:
        title: Short task title.
        subject: Subject name, max 20 characters.
        due_date: Due date as YYYY-MM-DD.
        priority: One of LOW, MEDIUM, HIGH.
    """
    user = _user()
    if not user:
        return {"error": "No user found"}
    if not str(title).strip():
        return {"error": "title is required"}
    if not str(subject).strip() or len(subject) > 20:
        return {"error": "subject is required and must be at most 20 characters"}
    if err := _check_date(due_date):
        return {"error": err}
    priority = str(priority).upper()
    if priority not in PRIORITIES:
        return {"error": f"priority must be one of {PRIORITIES}"}
    task = Task.objects.create(
        user=user, title=title.strip(), subject=subject.strip(),
        due_date=due_date, priority=priority, status="PENDING",
    )
    return _task_dict(task)


def update_task(task_id: int, due_date: str = "", priority: str = "", status: str = "") -> dict:
    """Update an existing task's due date, priority and/or status. Only non-empty fields change.

    Args:
        task_id: ID of an existing task. It must come from a list_tasks result; never guess it or ask the user for it.
        due_date: New due date as YYYY-MM-DD, or empty to keep.
        priority: LOW, MEDIUM or HIGH, or empty to keep.
        status: PENDING or COMPLETED, or empty to keep.
    """
    user = _user()
    try:
        task = Task.objects.get(id=int(task_id), user=user)
    except (Task.DoesNotExist, TypeError, ValueError):
        return {"error": f"task_id {task_id} does not exist"}
    if due_date:
        if err := _check_date(due_date):
            return {"error": err}
        task.due_date = due_date
    if priority:
        if priority.upper() not in PRIORITIES:
            return {"error": f"priority must be one of {PRIORITIES}"}
        task.priority = priority.upper()
    if status:
        if status.upper() not in STATUSES:
            return {"error": f"status must be one of {STATUSES}"}
        task.status = status.upper()
    task.save()
    task.refresh_from_db()
    return _task_dict(task)


AGENT_TOOLS = [get_today_date, list_tasks, create_task, update_task]
