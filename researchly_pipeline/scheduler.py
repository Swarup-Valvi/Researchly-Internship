#!/usr/bin/env python3
"""APScheduler entrypoint: python scheduler.py --interval-hours 12  (runs reviewed sources only)."""
from __future__ import annotations

import argparse

from apscheduler.schedulers.blocking import BlockingScheduler

import run


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--interval-hours", type=float, default=12.0)
    p.add_argument("--limit", type=int, default=50)
    a = p.parse_args()
    job_args = run.build_parser().parse_args(["--limit", str(a.limit)])
    sched = BlockingScheduler(timezone="UTC")
    sched.add_job(lambda: run.run_pipeline(job_args), "interval", hours=a.interval_hours, next_run_time=None,
                  max_instances=1, coalesce=True, id="researchly-ingest")
    print(f"scheduler started: every {a.interval_hours}h (Ctrl+C to stop)")
    try:
        run.run_pipeline(job_args)  # first run immediately
        sched.start()
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
