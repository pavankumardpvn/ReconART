"""Multi-currency support with static exchange rates."""

from __future__ import annotations


# Static exchange rates relative to USD (no external API needed)
EXCHANGE_RATES: dict[str, float] = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 149.5,
    "CAD": 1.36,
    "AUD": 1.53,
    "CHF": 0.88,
    "CNY": 7.24,
    "INR": 83.1,
    "BRL": 4.97,
    "MXN": 17.15,
    "SGD": 1.34,
    "HKD": 7.82,
    "KRW": 1320.0,
    "ZAR": 18.6,
}


def convert_amount(amount: float, from_currency: str, to_currency: str) -> float:
    """Convert *amount* from one currency to another using static rates."""
    if from_currency == to_currency:
        return amount
    from_rate = EXCHANGE_RATES.get(from_currency.upper(), 1.0)
    to_rate = EXCHANGE_RATES.get(to_currency.upper(), 1.0)
    return round(amount * (to_rate / from_rate), 4)


def get_supported_currencies() -> list[str]:
    """Return a sorted list of supported ISO currency codes."""
    return sorted(EXCHANGE_RATES.keys())


def get_rates(base: str = "USD") -> dict[str, float]:
    """Return all rates relative to *base*."""
    base_rate = EXCHANGE_RATES.get(base.upper(), 1.0)
    return {
        code: round(rate / base_rate, 6)
        for code, rate in sorted(EXCHANGE_RATES.items())
    }
