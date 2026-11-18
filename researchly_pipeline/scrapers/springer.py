from scrapers.base import register
from scrapers.listing import ListingScraper


@register
class SpringerScraper(ListingScraper):
    name = "springer"
    publisher_name = "Springer"
