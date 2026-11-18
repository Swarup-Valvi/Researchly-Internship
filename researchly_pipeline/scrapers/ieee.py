from scrapers.base import register
from scrapers.listing import ListingScraper


@register
class IEEEScraper(ListingScraper):
    name = "ieee"
    publisher_name = "IEEE"
