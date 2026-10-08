"""Computed forcings — the fields that are derived, never downloaded.

Two distinct time sets, and conflating them is the easy mistake:

``input times``
    The history pair the state is assembled from: t-6h and t.
``target times``
    Every lead the rollout will produce: t+6h ... t+240h.

``toa_incident_solar_radiation`` is required at **both**. Upstream is explicit
that it "needs to be computed for target lead times in an operational setting" —
an autoregressive rollout consumes the forcing at each step it predicts, so a
forcing array covering only the inputs strands the rollout at its first step.

Time features are cheap and local. TOA radiation is astronomical: it comes from
``graphcast.solar_radiation``, which is why it is listed as COMPUTED rather than
DYNAMIC in the acquisition manifest — there is no weather service to ask.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

TIME_STEP_HOURS = 6


class ForcingError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class ForcingCode:
    MISSING_TARGET_TIME = "MISSING_TARGET_TIME"
    MISALIGNED_TIME = "MISALIGNED_TIME"
    EMPTY_HORIZON = "EMPTY_HORIZON"


@dataclass(frozen=True)
class ForcingSchedule:
    """The exact timestamps a run needs forcings for."""

    base_time: datetime
    input_times: tuple[datetime, ...]
    target_times: tuple[datetime, ...]

    @property
    def all_times(self) -> tuple[datetime, ...]:
        return self.input_times + self.target_times

    @property
    def lead_hours(self) -> tuple[int, ...]:
        return tuple(
            int((t - self.base_time).total_seconds() // 3600) for t in self.target_times
        )


def build_schedule(
    base_time: datetime,
    history_hours: Sequence[int],
    horizon_hours: int,
    step_hours: int = TIME_STEP_HOURS,
) -> ForcingSchedule:
    """Enumerate input and target timestamps for a rollout.

    ``horizon_hours`` is the furthest lead the rollout will produce, e.g. 240
    for a ten-day forecast.
    """
    if horizon_hours < step_hours:
        raise ForcingError(
            ForcingCode.EMPTY_HORIZON,
            f"horizon {horizon_hours}h is shorter than one {step_hours}h step",
        )
    if horizon_hours % step_hours:
        raise ForcingError(
            ForcingCode.MISALIGNED_TIME,
            f"horizon {horizon_hours}h is not a multiple of the {step_hours}h step",
        )
    if base_time.tzinfo is None:
        base_time = base_time.replace(tzinfo=timezone.utc)

    inputs = tuple(base_time + timedelta(hours=h) for h in sorted(history_hours))
    n_steps = horizon_hours // step_hours
    targets = tuple(
        base_time + timedelta(hours=step_hours * i) for i in range(1, n_steps + 1)
    )
    return ForcingSchedule(base_time=base_time, input_times=inputs, target_times=targets)


def year_progress(t: datetime) -> float:
    start = datetime(t.year, 1, 1, tzinfo=timezone.utc)
    end = datetime(t.year + 1, 1, 1, tzinfo=timezone.utc)
    return (t - start).total_seconds() / (end - start).total_seconds()


def day_progress(t: datetime) -> float:
    return (t.hour * 3600 + t.minute * 60 + t.second) / 86400.0


def time_features(t: datetime) -> dict[str, float]:
    """The four trigonometric progress features GraphCast expects."""
    yp = year_progress(t)
    dp = day_progress(t)
    return {
        "year_progress_sin": math.sin(2 * math.pi * yp),
        "year_progress_cos": math.cos(2 * math.pi * yp),
        "day_progress_sin": math.sin(2 * math.pi * dp),
        "day_progress_cos": math.cos(2 * math.pi * dp),
    }


def assert_covers_targets(
    schedule: ForcingSchedule, forcing_times: Sequence[datetime]
) -> None:
    """Fail closed when a forcing array does not span every target lead.

    The failure this exists to catch is a forcing array built from the input
    times alone: it looks populated, and the rollout dies (or silently reuses a
    stale radiation field) at the first predicted step.
    """
    have = {_utc(t) for t in forcing_times}
    missing = [t for t in schedule.all_times if _utc(t) not in have]
    if missing:
        raise ForcingError(
            ForcingCode.MISSING_TARGET_TIME,
            f"forcings missing for {len(missing)} timestamp(s), first {missing[0].isoformat()}; "
            f"need all {len(schedule.all_times)} of inputs+targets, not just inputs",
        )


def assert_aligned(schedule: ForcingSchedule, step_hours: int = TIME_STEP_HOURS) -> None:
    """Every timestamp must sit on the model's step grid."""
    for t in schedule.all_times:
        delta = (t - schedule.base_time).total_seconds() / 3600.0
        if delta % step_hours:
            raise ForcingError(
                ForcingCode.MISALIGNED_TIME,
                f"{t.isoformat()} is {delta}h from base, not a multiple of {step_hours}h",
            )


def _utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def toa_incident_solar_radiation(times: Sequence[datetime], lat: Any, lon: Any) -> Any:
    """Delegate to graphcast.solar_radiation for the real computation.

    Kept as a thin seam so the schedule logic above is testable without JAX,
    and so there is exactly one place the astronomical field is produced.
    """
    from graphcast import solar_radiation  # type: ignore

    return solar_radiation.get_toa_incident_solar_radiation(
        timestamps=times, latitude=lat, longitude=lon
    )
