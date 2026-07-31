# Sample Data for Recon ART Demo

## Files

### bank_statement.csv (25 transactions)
Simulated bank statement for January 2024. Contains:
- 15 matching transactions (exact match by reference number)
- 2 Stripe settlements that need many-to-one matching (TXN009 + TXN010 = LED009)
- 1 duplicate payment (TXN023 duplicates TXN011/LED010)
- 1 mystery deposit with no reference (TXN024)
- 1 ATM withdrawal with no ledger entry (TXN022)
- 1 extra bank fee not in ledger (LED023)

### company_ledger.csv (23 entries)
Internal accounting ledger for the same period. Maps to bank statement via `reference_number`.

### stripe_settlements.csv (5 payouts)
Payment gateway settlement data. Two of these (po_1ABC + po_2DEF) should match the combined Stripe entry in the ledger (LED009: $9,100.75).

## Demo Reconciliation Scenarios

1. **Bank vs Ledger** — Match `bank_statement.csv` against `company_ledger.csv` using `reference` = `reference_number`. Expected: ~80% match rate, several exceptions.

2. **Gateway vs Bank** — Match `stripe_settlements.csv` against `bank_statement.csv` using `net_amount` = `amount` with tolerance. Tests many-to-one matching.
