
# Fake _strptime module for static analysis
class _TimeRE:
    def __init__(self, locale_time=None):
        self.locale_time = locale_time or object()

_cache_lock = object()
_regex_cache = {}
_CACHE_MAX_SIZE = 100
