from scrapers.base import register
from scrapers.listing import ListingScraper


@register
class ACMScraper(ListingScraper):
    name = "acm"
    publisher_name = "ACM"
