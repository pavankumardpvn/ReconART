"""Monetary value helpers for safe decimal arithmetic."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation


def quantize_decimal(value: float | str | Decimal, places: int = 4) -> Decimal:
    """Round a numeric value to the specified number of decimal places.

    Uses ROUND_HALF_UP (banker-friendly) rounding.

    Args:
        value: The number to quantize.
        places: Number of decimal places (default 4).

    Returns:
        A ``Decimal`` rounded to *places* digits.

    Raises:
        ValueError: If *value* cannot be converted to Decimal.
    """
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"Cannot convert {value!r} to Decimal") from exc

    quantizer = Decimal(10) ** -places  # e.g. Decimal('0.0001')
    return d.quantize(quantizer, rounding=ROUND_HALF_UP)


def format_currency(amount: float | str | Decimal, currency: str = "USD") -> str:
    """Format a numeric amount as a human-readable currency string.

    Args:
        amount: The monetary value.
        currency: ISO 4217 currency code (default ``'USD'``).

    Returns:
        A string like ``'USD 1,234.56'``.
    """
    d = quantize_decimal(amount, places=2)
    # Format with thousands separator
    formatted = f"{d:,.2f}"
    return f"{currency} {formatted}"
