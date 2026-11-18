import logging

import httpx

from fetcher import Fetcher, TokenBucket

CFG = {"user_agent": "TestBot/1 (+test@example.com)", "respect_robots": True, "max_retries": 3, "backoff_base_seconds": 2.0,
       "requests_per_minute": 600, "timeout_seconds": 5}


def make(handler, cfg=CFG):
    sleeps = []
    f = Fetcher(cfg, logging.getLogger("t"), client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=sleeps.append)
    return f, sleeps


def test_retries_429_then_succeeds_with_exponential_backoff():
    calls = {"n": 0}

    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        calls["n"] += 1
        return httpx.Response(429) if calls["n"] < 3 else httpx.Response(200, text="ok")

    f, sleeps = make(h)
    r = f.get("https://a.test/x")
    assert r.ok and r.text == "ok" and calls["n"] == 3
    assert [s for s in sleeps if s >= 2] == [2.0, 4.0]


def test_gives_up_after_three_attempts_without_raising():
    f, _ = make(lambda req: httpx.Response(404) if req.url.path == "/robots.txt" else httpx.Response(503))
    r = f.get("https://a.test/x")
    assert not r.ok and "3 attempts" in r.error


def test_robots_disallow_is_respected_and_reported():
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private")
        return httpx.Response(200, text="secret")
    f, _ = make(h)
    r = f.get("https://a.test/private/page")
    assert r.skipped_reason == "robots_disallowed" and not r.ok
    assert f.get("https://a.test/public").ok


def test_client_error_is_not_retried():
    n = {"c": 0}

    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        n["c"] += 1
        return httpx.Response(404)
    f, _ = make(h)
    assert not f.get("https://a.test/x").ok and n["c"] == 1


def test_conditional_get_304():
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        assert req.headers["if-none-match"] == "abc"
        return httpx.Response(304)
    f, _ = make(h)
    assert f.get("https://a.test/x", etag="abc").not_modified


def test_token_bucket_spaces_requests_per_domain():
    t = {"now": 0.0}
    sleeps = []

    def sleep(s):
        sleeps.append(s); t["now"] += s
    b = TokenBucket(6, lambda: t["now"], sleep)  # 1 request / 10 s
    b.acquire(); b.acquire(); b.acquire()
    assert sleeps == [10.0, 10.0]


def test_robots_crawl_delay_slows_bucket_but_never_speeds_it_up():
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: TestBot\nCrawl-delay: 15\n")
        return httpx.Response(200, text="ok")
    f, _ = make(h, {**CFG, "requests_per_minute": 6})       # bucket default: 10 s
    assert f.get("https://a.test/x").ok and f.buckets["a.test"].interval == 15.0

    def fast(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nCrawl-delay: 1\n")
        return httpx.Response(200, text="ok")
    f, _ = make(fast, {**CFG, "requests_per_minute": 6})
    assert f.get("https://b.test/x").ok and f.buckets["b.test"].interval == 10.0
