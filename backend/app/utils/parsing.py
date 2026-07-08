from __future__ import annotations

import re


_NA_VALUES = {"", "N/A", "NA", "null", "None", "unknown", "Unknown", "-"}


def _parse_int(s: str | None) -> int | None:
    if not s:
        return None
    m = re.search(r"[\d,]+", s.replace("$", ""))
    if not m:
        return None
    try:
        return int(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _clean_address(address: str) -> str:
    """Strip prefixes/suffixes that confuse geocoders."""
    cleaned = re.sub(r"^\d+BR,?\s*", "", address)
    cleaned = re.sub(r"\s*-\s*\$[\d,]+/month$", "", cleaned)
    cleaned = re.sub(r",?\s*\$[\d,]+/month$", "", cleaned)
    cleaned = re.sub(r"\s*-\s*Apartments?\.?.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Apt\.?\s+[\w-]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Unit\s+[\w-]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Suite\s+[\w-]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+#\s*[\w-]+", "", cleaned)
    cleaned = re.sub(r"\s+Apartments?,?\s*", " ", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip().rstrip(",").strip()
    return cleaned


def _clean_extracted_address(raw: str) -> str:
    cleaned = re.sub(r",?\s*\$[\d,.]+/?(?:mo|month)?$", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r",?\s*\$[\d,.]+\s*$", "", cleaned)
    return cleaned.strip().rstrip(",").strip()


def _address_from_name(name: str) -> str | None:
    """Last-resort fallback: only used when the API didn't return a street_address.
    Recognizes either a street-number address or a named-building pattern in the
    candidate's name field. Pure post-filter, no description-prose mining."""
    if re.search(r"\d+\s+\w+\s+(St|Ave|Blvd|Dr|Rd|Way|Ln|Pl|Ct)", name):
        return _clean_extracted_address(name)
    return None


def _normalize_address(addr: str) -> str:
    s = addr.lower().strip()
    s = re.sub(r"\s*(apt|unit|suite|ste|#)\s*[\w-]+", "", s, flags=re.IGNORECASE)
    s = re.sub(r",?\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}(-\d{4})?$", "", s)
    s = re.sub(r",?\s*[A-Z]{2}\s+\d{5}(-\d{4})?$", "", s)
    s = re.sub(r",?\s*\d{5}(-\d{4})?$", "", s)
    s = re.sub(r",?\s*[A-Z]{2}$", "", s)
    return s.strip().rstrip(",").strip()


def _output_val(output: dict, key: str) -> str | None:
    """Read either a match_condition value or an enrichment value by key."""
    obj = output.get(key)
    if not obj:
        return None
    v = obj.get("value")
    if v is None:
        return None
    s = str(v).strip()
    return s if s not in _NA_VALUES else None


def _output_float(output: dict, key: str) -> float | None:
    s = _output_val(output, key)
    if not s:
        return None
    m = re.search(r"\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def _output_bool(output: dict, key: str, true_words: tuple[str, ...] = ("yes", "true", "available", "allowed", "included")) -> bool | None:
    s = _output_val(output, key)
    if not s:
        return None
    sl = s.lower()
    if any(w in sl for w in true_words):
        return True
    if any(w in sl for w in ("no", "none", "not", "false", "unavailable", "n/a")):
        return False
    return None
