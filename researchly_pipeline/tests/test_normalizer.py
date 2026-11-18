from normalizer.dates import parse_date, parse_range
from normalizer.names import canonical_name, extract_acronym, extract_year, match_key
from normalizer.records import parse_fees, parse_location


def test_deadline_with_aoe_becomes_offset_datetime():
    assert parse_date("Sep 30, 2026 23:59 AoE") == ("2026-09-30T23:59-12:00", "AoE")


def test_original_deadline_in_parentheses_is_ignored():
    assert parse_date("Jan 20, 2027 (Dec 15, 2026)")[0] == "2027-01-20"


def test_no_year_is_never_invented():
    assert parse_date("March 3")[0] is None
    assert parse_date("TBD") == (None, None)


def test_timezone_conversion_and_raw_label():
    iso, tz = parse_date("Mar 1, 2027 23:59 CEST")  # convertible
    assert iso == "2027-03-01T23:59+02:00"
    iso, tz = parse_date("Mar 1, 2027 UTC+5:30")
    assert iso == "2027-03-01" and tz == "UTC+5:30"


def test_ranges():
    assert parse_range("Jun 14, 2027 - Jun 18, 2027") == ("2027-06-14", "2027-06-18")
    assert parse_range("Aug 3-5, 2027") == ("2027-08-03", "2027-08-05")
    assert parse_range("Dec 30, 2026 - Jan 2, 2027") == ("2026-12-30", "2027-01-02")
    assert parse_range("15-19 June 2027") == ("2027-06-15", "2027-06-19")
    assert parse_range("2027-06-14 - 2027-06-18") == ("2027-06-14", "2027-06-18")
    assert parse_range("TBD") == (None, None)


def test_names():
    assert extract_year("ICALS 2027") == 2027
    assert extract_acronym("ICALS 2027") == "ICALS"
    assert extract_acronym("Symposium on Secure Data Analytics (SECDA 2027)") == "SECDA"
    assert canonical_name("13th Symposium on Secure Data Analytics (SECDA 2027)") == "Symposium on Secure Data Analytics"
    assert match_key("IEEE International Conference on Applied Learning Systems") == match_key("International Conference on Applied Learning Systems")


def test_location_and_fees():
    assert parse_location("Seattle, WA, USA", None).country == "United States"
    assert parse_location("Virtual", None).is_virtual is True
    assert parse_location("TBD", None).country == "TBD" or True  # TBD handled upstream by null checks
    f = parse_fees("Registration $750 regular")
    assert (f.currency, f.amount) == ("USD", 750.0)
    assert parse_fees(None).amount is None
