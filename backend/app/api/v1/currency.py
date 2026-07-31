"""Multi-currency reconciliation endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.currency_service import (
    EXCHANGE_RATES,
    convert_amount,
    get_rates,
    get_supported_currencies,
)

router = APIRouter()


# ---- schemas ---------------------------------------------------------------

class ConvertRequest(BaseModel):
    amount: float
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)


class ConvertResponse(BaseModel):
    original_amount: float
    converted_amount: float
    from_currency: str
    to_currency: str
    rate: float


# ---- endpoints -------------------------------------------------------------

@router.get("/")
async def list_currencies():
    """Return all supported currencies with their USD-based rates."""
    return {
        "currencies": get_supported_currencies(),
        "rates": get_rates("USD"),
        "base": "USD",
    }


@router.post("/convert", response_model=ConvertResponse)
async def convert(payload: ConvertRequest):
    """Convert an amount between two supported currencies."""
    converted = convert_amount(
        payload.amount, payload.from_currency, payload.to_currency
    )
    from_rate = EXCHANGE_RATES.get(payload.from_currency.upper(), 1.0)
    to_rate = EXCHANGE_RATES.get(payload.to_currency.upper(), 1.0)
    rate = round(to_rate / from_rate, 6)
    return ConvertResponse(
        original_amount=payload.amount,
        converted_amount=converted,
        from_currency=payload.from_currency.upper(),
        to_currency=payload.to_currency.upper(),
        rate=rate,
    )
