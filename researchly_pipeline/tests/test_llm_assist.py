import json

from extractors.llm_assist import extract, ground

PAGE = "ICALS 2027 will be held in Lisbon. Paper submission deadline: January 20, 2027. Proceedings by IEEE."


def test_grounded_evidence_is_kept():
    resp = json.dumps({"submission_deadline": {"evidence": "Paper submission deadline: January 20, 2027"}})
    assert ground(resp, PAGE) == {"submission_deadline": "Paper submission deadline: January 20, 2027"}


def test_hallucinated_evidence_is_dropped():
    resp = json.dumps({"publisher": {"evidence": "Published by Springer"}, "location": {"evidence": "held in Lisbon"}})
    assert ground(resp, PAGE) == {"location": "held in Lisbon"}


def test_malformed_model_output_is_safe():
    assert ground("not json at all", PAGE) == {}
    assert extract(PAGE, lambda p: "```json\n{\"dates\": {\"evidence\": \"held in Lisbon\"}}\n```") == {"dates": "held in Lisbon"}
