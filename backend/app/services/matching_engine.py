"""Core reconciliation matching engine.

This is the central value proposition of Recon ART. It matches rows from
two data sources according to user-defined rules, producing matched pairs
and flagging unmatched items as exceptions.

Algorithm overview
------------------
1. Load left and right datasets from data_source_rows.
2. Apply segment filters if configured.
3. For each rule (ordered by priority):
   a. Build match candidates using key columns (hash-based pre-filtering).
   b. Apply all conditions in the rule to each candidate pair.
   c. Score the match (confidence 0.0–1.0).
   d. Accept matches above threshold.
   e. Remove matched rows from the pool.
4. Remaining unmatched rows become exceptions.
5. Persist all results to the database.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from rapidfuzz import fuzz
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSourceRow
from app.models.matching import Exception_, MatchPair, MatchPairItem, ReconRun
from app.models.reconciliation import Reconciliation, ReconRule, ReconRuleCondition
from app.models.segment import Segment, SegmentRule

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    left_indices: set[int]
    right_indices: set[int]
    confidence: float
    rule_id: uuid.UUID
    left_amount: Decimal | None = None
    right_amount: Decimal | None = None
    difference: Decimal | None = None


@dataclass
class EngineStats:
    left_total: int = 0
    right_total: int = 0
    matched: int = 0
    unmatched_left: int = 0
    unmatched_right: int = 0
    exceptions: int = 0
    match_rate: float = 0.0


class MatchingEngine:

    def __init__(self, db: AsyncSession):
        self._db = db

    async def run(self, reconciliation_id: uuid.UUID, run_id: uuid.UUID) -> EngineStats:
        await self._update_run_status(run_id, "running")

        try:
            recon = await self._load_reconciliation(reconciliation_id)
            rules = await self._load_rules(reconciliation_id)
            all_conditions: list[ReconRuleCondition] = []
            left_rows = await self._load_rows(recon.left_source_id, recon.tenant_id)
            right_rows = await self._load_rows(recon.right_source_id, recon.tenant_id)

            segments = await self._load_segments(reconciliation_id, recon.tenant_id)
            if segments:
                left_rows = self._apply_segments(left_rows, segments, "left")
                right_rows = self._apply_segments(right_rows, segments, "right")

            unmatched_left = set(range(len(left_rows)))
            unmatched_right = set(range(len(right_rows)))
            all_matches: list[MatchResult] = []

            for rule in rules:
                if not rule.is_active:
                    continue
                conditions = await self._load_conditions(rule.id)
                all_conditions.extend(conditions)
                matches = self._apply_rule(
                    rule, conditions, left_rows, right_rows,
                    unmatched_left, unmatched_right,
                )
                for m in matches:
                    all_matches.append(m)
                    unmatched_left -= m.left_indices
                    unmatched_right -= m.right_indices

            await self._persist_matches(run_id, recon.tenant_id, all_matches, left_rows, right_rows)
            await self._persist_exceptions(
                run_id, recon.tenant_id,
                left_rows, unmatched_left, "left",
                right_rows, unmatched_right, "right",
                all_conditions, all_matches,
            )

            total_rows = len(left_rows) + len(right_rows)
            matched_rows = sum(len(m.left_indices) + len(m.right_indices) for m in all_matches)
            match_rate = (matched_rows / total_rows * 100) if total_rows > 0 else 0.0

            stats = EngineStats(
                left_total=len(left_rows),
                right_total=len(right_rows),
                matched=len(all_matches),
                unmatched_left=len(unmatched_left),
                unmatched_right=len(unmatched_right),
                exceptions=len(unmatched_left) + len(unmatched_right),
                match_rate=round(match_rate, 4),
            )

            await self._finalize_run(run_id, stats)
            return stats

        except Exception as exc:
            logger.exception("Reconciliation run %s failed", run_id)
            await self._update_run_status(run_id, "failed", error_message=str(exc))
            raise

    def _apply_rule(
        self,
        rule: ReconRule,
        conditions: list[ReconRuleCondition],
        left_rows: list[dict],
        right_rows: list[dict],
        available_left: set[int],
        available_right: set[int],
    ) -> list[MatchResult]:
        if rule.match_type == "exact":
            return self._exact_match(rule, conditions, left_rows, right_rows, available_left, available_right)
        elif rule.match_type == "tolerance":
            return self._tolerance_match(rule, conditions, left_rows, right_rows, available_left, available_right)
        elif rule.match_type == "fuzzy":
            return self._fuzzy_match(rule, conditions, left_rows, right_rows, available_left, available_right)
        elif rule.match_type in ("many_to_one", "one_to_many"):
            return self._grouped_match(rule, conditions, left_rows, right_rows, available_left, available_right)
        return []

    def _exact_match(
        self,
        rule: ReconRule,
        conditions: list[ReconRuleCondition],
        left_rows: list[dict],
        right_rows: list[dict],
        available_left: set[int],
        available_right: set[int],
    ) -> list[MatchResult]:
        key_conditions = [c for c in conditions if c.is_key]
        value_conditions = [c for c in conditions if not c.is_key]

        right_index: dict[tuple, list[int]] = defaultdict(list)
        for idx in available_right:
            key = self._make_key(right_rows[idx], key_conditions, "right")
            if key is not None:
                right_index[key].append(idx)

        matches = []
        used_right: set[int] = set()

        for left_idx in sorted(available_left):
            key = self._make_key(left_rows[left_idx], key_conditions, "left")
            if key is None:
                continue
            candidates = right_index.get(key, [])
            for right_idx in candidates:
                if right_idx in used_right:
                    continue
                if self._check_value_conditions(value_conditions, left_rows[left_idx], right_rows[right_idx]):
                    left_amt = self._get_decimal(left_rows[left_idx], value_conditions, "left")
                    right_amt = self._get_decimal(right_rows[right_idx], value_conditions, "right")
                    diff = (left_amt - right_amt) if left_amt is not None and right_amt is not None else None
                    matches.append(MatchResult(
                        left_indices={left_idx},
                        right_indices={right_idx},
                        confidence=1.0,
                        rule_id=rule.id,
                        left_amount=left_amt,
                        right_amount=right_amt,
                        difference=diff,
                    ))
                    used_right.add(right_idx)
                    break

        return matches

    def _tolerance_match(
        self,
        rule: ReconRule,
        conditions: list[ReconRuleCondition],
        left_rows: list[dict],
        right_rows: list[dict],
        available_left: set[int],
        available_right: set[int],
    ) -> list[MatchResult]:
        key_conditions = [c for c in conditions if c.is_key]
        tolerance_conditions = [c for c in conditions if c.comparison in ("tolerance_abs", "tolerance_pct")]
        other_conditions = [c for c in conditions if not c.is_key and c.comparison not in ("tolerance_abs", "tolerance_pct")]

        right_index: dict[tuple, list[int]] = defaultdict(list)
        for idx in available_right:
            key = self._make_key(right_rows[idx], key_conditions, "right")
            if key is not None:
                right_index[key].append(idx)

        matches = []
        used_right: set[int] = set()

        for left_idx in sorted(available_left):
            key = self._make_key(left_rows[left_idx], key_conditions, "left")
            if key is None:
                continue
            candidates = right_index.get(key, [])
            best_match = None
            best_diff = None

            for right_idx in candidates:
                if right_idx in used_right:
                    continue
                if not self._check_value_conditions(other_conditions, left_rows[left_idx], right_rows[right_idx]):
                    continue
                if self._check_tolerance(tolerance_conditions, left_rows[left_idx], right_rows[right_idx]):
                    left_amt = self._get_amount_from_conditions(left_rows[left_idx], tolerance_conditions, "left")
                    right_amt = self._get_amount_from_conditions(right_rows[right_idx], tolerance_conditions, "right")
                    diff = abs(left_amt - right_amt) if left_amt is not None and right_amt is not None else None
                    if best_match is None or (diff is not None and (best_diff is None or diff < best_diff)):
                        best_match = right_idx
                        best_diff = diff

            if best_match is not None:
                left_amt = self._get_amount_from_conditions(left_rows[left_idx], tolerance_conditions, "left")
                right_amt = self._get_amount_from_conditions(right_rows[best_match], tolerance_conditions, "right")
                confidence = 1.0 - (float(best_diff) / float(left_amt) if left_amt and best_diff else 0.0)
                matches.append(MatchResult(
                    left_indices={left_idx},
                    right_indices={best_match},
                    confidence=max(0.0, min(1.0, confidence)),
                    rule_id=rule.id,
                    left_amount=left_amt,
                    right_amount=right_amt,
                    difference=Decimal(str(best_diff)) if best_diff is not None else None,
                ))
                used_right.add(best_match)

        return matches

    def _fuzzy_match(
        self,
        rule: ReconRule,
        conditions: list[ReconRuleCondition],
        left_rows: list[dict],
        right_rows: list[dict],
        available_left: set[int],
        available_right: set[int],
    ) -> list[MatchResult]:
        key_conditions = [c for c in conditions if c.is_key]
        fuzzy_conditions = [c for c in conditions if c.comparison == "fuzzy"]
        other_conditions = [c for c in conditions if not c.is_key and c.comparison != "fuzzy"]

        right_index: dict[tuple, list[int]] = defaultdict(list)
        if key_conditions:
            for idx in available_right:
                key = self._make_key(right_rows[idx], key_conditions, "right")
                if key is not None:
                    right_index[key].append(idx)

        matches = []
        used_right: set[int] = set()

        for left_idx in sorted(available_left):
            if key_conditions:
                key = self._make_key(left_rows[left_idx], key_conditions, "left")
                if key is None:
                    continue
                candidates = right_index.get(key, [])
            else:
                candidates = list(available_right)

            best_match = None
            best_score = 0.0

            for right_idx in candidates:
                if right_idx in used_right:
                    continue
                if not self._check_value_conditions(other_conditions, left_rows[left_idx], right_rows[right_idx]):
                    continue
                score = self._compute_fuzzy_score(fuzzy_conditions, left_rows[left_idx], right_rows[right_idx])
                threshold = min(
                    (c.fuzzy_threshold for c in fuzzy_conditions if c.fuzzy_threshold is not None),
                    default=Decimal("0.85"),
                )
                if score >= float(threshold) and score > best_score:
                    best_match = right_idx
                    best_score = score

            if best_match is not None:
                left_amt = self._get_decimal(left_rows[left_idx], conditions, "left")
                right_amt = self._get_decimal(right_rows[best_match], conditions, "right")
                diff = (left_amt - right_amt) if left_amt is not None and right_amt is not None else None
                matches.append(MatchResult(
                    left_indices={left_idx},
                    right_indices={best_match},
                    confidence=best_score,
                    rule_id=rule.id,
                    left_amount=left_amt,
                    right_amount=right_amt,
                    difference=diff,
                ))
                used_right.add(best_match)

        return matches

    def _grouped_match(
        self,
        rule: ReconRule,
        conditions: list[ReconRuleCondition],
        left_rows: list[dict],
        right_rows: list[dict],
        available_left: set[int],
        available_right: set[int],
    ) -> list[MatchResult]:
        key_conditions = [c for c in conditions if c.is_key]
        amount_conditions = [c for c in conditions if not c.is_key]

        if rule.match_type == "many_to_one":
            group_side_rows = left_rows
            group_available = available_left
            single_side_rows = right_rows
            single_available = available_right
            group_col_side = "left"
            single_col_side = "right"
        else:
            group_side_rows = right_rows
            group_available = available_right
            single_side_rows = left_rows
            single_available = available_left
            group_col_side = "right"
            single_col_side = "left"

        grouped: dict[tuple, list[int]] = defaultdict(list)
        for idx in group_available:
            key = self._make_key(group_side_rows[idx], key_conditions, group_col_side)
            if key is not None:
                grouped[key].append(idx)

        matches = []
        used_single: set[int] = set()
        used_group: set[int] = set()

        for single_idx in sorted(single_available):
            key = self._make_key(single_side_rows[single_idx], key_conditions, single_col_side)
            if key is None:
                continue
            group_indices = grouped.get(key, [])
            group_indices = [i for i in group_indices if i not in used_group]
            if not group_indices:
                continue

            single_amt = self._get_amount_from_conditions(single_side_rows[single_idx], amount_conditions, single_col_side)
            if single_amt is None:
                continue

            group_sum = Decimal(0)
            for gi in group_indices:
                amt = self._get_amount_from_conditions(group_side_rows[gi], amount_conditions, group_col_side)
                if amt is not None:
                    group_sum += amt

            if single_amt == group_sum:
                if rule.match_type == "many_to_one":
                    matches.append(MatchResult(
                        left_indices=set(group_indices),
                        right_indices={single_idx},
                        confidence=1.0,
                        rule_id=rule.id,
                        left_amount=group_sum,
                        right_amount=single_amt,
                        difference=Decimal(0),
                    ))
                else:
                    matches.append(MatchResult(
                        left_indices={single_idx},
                        right_indices=set(group_indices),
                        confidence=1.0,
                        rule_id=rule.id,
                        left_amount=single_amt,
                        right_amount=group_sum,
                        difference=Decimal(0),
                    ))
                used_single.add(single_idx)
                used_group.update(group_indices)

        return matches

    # ---- helpers ----

    def _make_key(self, row: dict, key_conditions: list[ReconRuleCondition], side: str) -> tuple | None:
        parts = []
        for c in key_conditions:
            col = c.left_column if side == "left" else c.right_column
            val = row.get(col)
            if val is None:
                return None
            parts.append(str(val).strip().lower())
        return tuple(parts)

    def _check_value_conditions(
        self, conditions: list[ReconRuleCondition], left: dict, right: dict
    ) -> bool:
        for c in conditions:
            left_val = left.get(c.left_column)
            right_val = right.get(c.right_column)
            if c.comparison == "exact":
                if str(left_val).strip().lower() != str(right_val).strip().lower():
                    return False
            elif c.comparison == "contains":
                if str(right_val).lower() not in str(left_val).lower():
                    return False
            elif c.comparison == "starts_with":
                if not str(left_val).lower().startswith(str(right_val).lower()):
                    return False
        return True

    def _check_tolerance(
        self, conditions: list[ReconRuleCondition], left: dict, right: dict
    ) -> bool:
        for c in conditions:
            try:
                left_val = Decimal(str(left.get(c.left_column, 0)))
                right_val = Decimal(str(right.get(c.right_column, 0)))
            except (InvalidOperation, TypeError):
                return False

            diff = abs(left_val - right_val)
            if c.comparison == "tolerance_abs":
                tolerance = c.tolerance_value or Decimal(0)
                if diff > tolerance:
                    return False
            elif c.comparison == "tolerance_pct":
                if left_val == 0:
                    return diff == 0
                pct = diff / abs(left_val) * 100
                tolerance = c.tolerance_value or Decimal(0)
                if pct > tolerance:
                    return False
        return True

    def _compute_fuzzy_score(
        self, conditions: list[ReconRuleCondition], left: dict, right: dict
    ) -> float:
        if not conditions:
            return 0.0
        scores = []
        for c in conditions:
            left_val = str(left.get(c.left_column, ""))
            right_val = str(right.get(c.right_column, ""))
            score = fuzz.token_sort_ratio(left_val, right_val) / 100.0
            scores.append(score)
        return sum(scores) / len(scores)

    def _get_decimal(
        self, row: dict, conditions: list[ReconRuleCondition], side: str
    ) -> Decimal | None:
        for c in conditions:
            col = c.left_column if side == "left" else c.right_column
            if c.comparison in ("tolerance_abs", "tolerance_pct", "exact"):
                try:
                    return Decimal(str(row.get(col, 0)))
                except (InvalidOperation, TypeError):
                    continue
        return None

    def _get_amount_from_conditions(
        self, row: dict, conditions: list[ReconRuleCondition], side: str
    ) -> Decimal | None:
        for c in conditions:
            col = c.left_column if side == "left" else c.right_column
            try:
                return Decimal(str(row.get(col, 0)))
            except (InvalidOperation, TypeError):
                continue
        return None

    # ---- segment filtering ----

    def _apply_segments(
        self, rows: list[dict], segments: list[tuple[Segment, list[SegmentRule]]], side: str
    ) -> list[dict]:
        filtered = []
        for row in rows:
            if any(self._row_matches_segment(row, rules, side) for _, rules in segments):
                filtered.append(row)
        return filtered if filtered else rows

    def _row_matches_segment(self, row: dict, rules: list[SegmentRule], side: str) -> bool:
        groups: dict[int, list[bool]] = defaultdict(list)
        for r in rules:
            if r.source_side not in (side, "both"):
                continue
            val = row.get(r.column_name)
            groups[r.logic_group].append(self._evaluate_rule(val, r.operator, r.value))
        if not groups:
            return True
        return any(all(results) for results in groups.values())

    def _evaluate_rule(self, val, operator: str, rule_value) -> bool:
        if val is None:
            return operator == "eq" and rule_value is None
        str_val = str(val).lower()
        try:
            if operator == "eq":
                return str_val == str(rule_value).lower()
            elif operator == "neq":
                return str_val != str(rule_value).lower()
            elif operator == "gt":
                return Decimal(str(val)) > Decimal(str(rule_value))
            elif operator == "lt":
                return Decimal(str(val)) < Decimal(str(rule_value))
            elif operator == "gte":
                return Decimal(str(val)) >= Decimal(str(rule_value))
            elif operator == "lte":
                return Decimal(str(val)) <= Decimal(str(rule_value))
            elif operator == "contains":
                return str(rule_value).lower() in str_val
            elif operator == "in":
                return str_val in [str(v).lower() for v in rule_value]
            elif operator == "between":
                low, high = rule_value
                return Decimal(str(low)) <= Decimal(str(val)) <= Decimal(str(high))
        except (InvalidOperation, TypeError, ValueError):
            return False
        return False

    # ---- database operations ----

    async def _load_reconciliation(self, recon_id: uuid.UUID) -> Reconciliation:
        result = await self._db.execute(
            select(Reconciliation).where(Reconciliation.id == recon_id)
        )
        recon = result.scalar_one_or_none()
        if not recon:
            raise ValueError(f"Reconciliation {recon_id} not found")
        return recon

    async def _load_rules(self, recon_id: uuid.UUID) -> list[ReconRule]:
        result = await self._db.execute(
            select(ReconRule)
            .where(ReconRule.reconciliation_id == recon_id)
            .order_by(ReconRule.priority)
        )
        return list(result.scalars().all())

    async def _load_conditions(self, rule_id: uuid.UUID) -> list[ReconRuleCondition]:
        result = await self._db.execute(
            select(ReconRuleCondition).where(ReconRuleCondition.rule_id == rule_id)
        )
        return list(result.scalars().all())

    async def _load_rows(self, source_id: uuid.UUID, tenant_id: uuid.UUID) -> list[dict]:
        result = await self._db.execute(
            select(DataSourceRow)
            .where(
                DataSourceRow.data_source_id == source_id,
                DataSourceRow.tenant_id == tenant_id,
            )
            .order_by(DataSourceRow.row_number)
        )
        rows = result.scalars().all()
        return [{"_row_id": r.id, "_row_number": r.row_number, **r.data} for r in rows]

    async def _load_segments(
        self, recon_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> list[tuple[Segment, list[SegmentRule]]]:
        result = await self._db.execute(
            select(Segment).where(
                Segment.tenant_id == tenant_id,
                Segment.reconciliation_id == recon_id,
            )
        )
        segments = result.scalars().all()
        out = []
        for seg in segments:
            rules_result = await self._db.execute(
                select(SegmentRule).where(SegmentRule.segment_id == seg.id)
            )
            rules = list(rules_result.scalars().all())
            out.append((seg, rules))
        return out

    async def _persist_matches(
        self,
        run_id: uuid.UUID,
        tenant_id: uuid.UUID,
        matches: list[MatchResult],
        left_rows: list[dict],
        right_rows: list[dict],
    ) -> None:
        for m in matches:
            pair = MatchPair(
                run_id=run_id,
                tenant_id=tenant_id,
                rule_id=m.rule_id,
                match_status="matched" if m.confidence == 1.0 else "partial",
                confidence_score=m.confidence,
                left_amount=m.left_amount,
                right_amount=m.right_amount,
                difference=m.difference,
                match_metadata={},
            )
            self._db.add(pair)
            await self._db.flush()

            for li in m.left_indices:
                row_id = left_rows[li].get("_row_id")
                if row_id:
                    self._db.add(MatchPairItem(
                        match_pair_id=pair.id,
                        data_source_row_id=row_id,
                        side="left",
                    ))
            for ri in m.right_indices:
                row_id = right_rows[ri].get("_row_id")
                if row_id:
                    self._db.add(MatchPairItem(
                        match_pair_id=pair.id,
                        data_source_row_id=row_id,
                        side="right",
                    ))

        await self._db.flush()

    async def _persist_exceptions(
        self,
        run_id: uuid.UUID,
        tenant_id: uuid.UUID,
        left_rows: list[dict],
        unmatched_left: set[int],
        left_side: str,
        right_rows: list[dict],
        unmatched_right: set[int],
        right_side: str,
        conditions: list[ReconRuleCondition] | None = None,
        matches: list[MatchResult] | None = None,
    ) -> None:
        conditions = conditions or []
        matches = matches or []
        key_conditions = [c for c in conditions if c.is_key]
        value_conditions = [c for c in conditions if not c.is_key]

        # Build sets of matched row indices for duplicate detection
        matched_left_indices: set[int] = set()
        matched_right_indices: set[int] = set()
        for m in matches:
            matched_left_indices.update(m.left_indices)
            matched_right_indices.update(m.right_indices)

        for idx in unmatched_left:
            row_id = left_rows[idx].get("_row_id")
            if not row_id:
                continue
            exc_type, severity = self._categorize_exception(
                left_rows[idx], right_rows, key_conditions, value_conditions,
                "left", matched_left_indices, left_rows, idx,
            )
            self._db.add(Exception_(
                run_id=run_id,
                tenant_id=tenant_id,
                data_source_row_id=row_id,
                side=left_side,
                exception_type=exc_type,
                severity=severity,
                status="open",
            ))

        for idx in unmatched_right:
            row_id = right_rows[idx].get("_row_id")
            if not row_id:
                continue
            exc_type, severity = self._categorize_exception(
                right_rows[idx], left_rows, key_conditions, value_conditions,
                "right", matched_right_indices, right_rows, idx,
            )
            self._db.add(Exception_(
                run_id=run_id,
                tenant_id=tenant_id,
                data_source_row_id=row_id,
                side=right_side,
                exception_type=exc_type,
                severity=severity,
                status="open",
            ))

        await self._db.flush()

    def _categorize_exception(
        self,
        row: dict,
        opposite_rows: list[dict],
        key_conditions: list[ReconRuleCondition],
        value_conditions: list[ReconRuleCondition],
        side: str,
        matched_same_side: set[int],
        same_side_rows: list[dict],
        row_idx: int,
    ) -> tuple[str, str]:
        """Determine the specific exception type and severity for an unmatched row.

        Checks the opposite side for near-miss matches to categorize why the
        row did not match, and also checks for duplicates on the same side.
        """
        if not key_conditions:
            return "unmatched", "medium"

        my_col_side = "left" if side == "left" else "right"
        opp_col_side = "right" if side == "left" else "left"

        # 1. Check for duplicate: does this row look identical to a matched row
        #    on the same side (same key values)?
        my_key = self._make_key(row, key_conditions, my_col_side)
        if my_key is not None:
            for matched_idx in matched_same_side:
                matched_key = self._make_key(same_side_rows[matched_idx], key_conditions, my_col_side)
                if matched_key == my_key:
                    return "duplicate", "high"

        # 2. Look for near-miss on the opposite side
        if my_key is not None:
            for opp_row in opposite_rows:
                opp_key = self._make_key(opp_row, key_conditions, opp_col_side)
                if opp_key != my_key:
                    continue

                # Key matches -- check which value condition failed
                for vc in value_conditions:
                    left_val = row.get(vc.left_column) if side == "left" else opp_row.get(vc.left_column)
                    right_val = opp_row.get(vc.right_column) if side == "left" else row.get(vc.right_column)

                    if vc.comparison in ("tolerance_abs", "tolerance_pct"):
                        try:
                            l_dec = Decimal(str(left_val or 0))
                            r_dec = Decimal(str(right_val or 0))
                            if l_dec != r_dec:
                                return "amount_mismatch", "high"
                        except (InvalidOperation, TypeError):
                            pass
                    elif vc.comparison == "exact":
                        l_str = str(left_val).strip().lower() if left_val is not None else ""
                        r_str = str(right_val).strip().lower() if right_val is not None else ""
                        if l_str != r_str:
                            # Heuristic: if the column name suggests a date, classify as date_mismatch
                            col_name = (vc.left_column + vc.right_column).lower()
                            if any(kw in col_name for kw in ("date", "time", "dt", "day", "month", "year")):
                                return "date_mismatch", "medium"
                            else:
                                return "amount_mismatch", "high"

                # Key matched, all value conditions passed (shouldn't happen, but default)
                return "amount_mismatch", "high"

        # 3. No near-miss found at all
        return "missing_record", "medium"

    async def _update_run_status(
        self, run_id: uuid.UUID, status: str, error_message: str | None = None
    ) -> None:
        values: dict = {"status": status}
        if status == "running":
            values["started_at"] = datetime.now(timezone.utc)
        elif status == "failed":
            values["completed_at"] = datetime.now(timezone.utc)
            if error_message:
                values["error_message"] = error_message

        await self._db.execute(
            update(ReconRun).where(ReconRun.id == run_id).values(**values)
        )

        # Update reconciliation status to match the run lifecycle
        run_result = await self._db.execute(select(ReconRun).where(ReconRun.id == run_id))
        run = run_result.scalar_one_or_none()
        if run:
            recon_status = "processing" if status == "running" else "failed" if status == "failed" else None
            if recon_status:
                await self._db.execute(
                    update(Reconciliation)
                    .where(Reconciliation.id == run.reconciliation_id)
                    .values(status=recon_status)
                )

        await self._db.flush()

    async def _finalize_run(self, run_id: uuid.UUID, stats: EngineStats) -> None:
        # Update run status to completed
        await self._db.execute(
            update(ReconRun).where(ReconRun.id == run_id).values(
                status="completed",
                completed_at=datetime.now(timezone.utc),
                left_row_count=stats.left_total,
                right_row_count=stats.right_total,
                matched_count=stats.matched,
                unmatched_left=stats.unmatched_left,
                unmatched_right=stats.unmatched_right,
                exception_count=stats.exceptions,
                match_rate=stats.match_rate,
            )
        )

        # Update reconciliation status to completed
        run_result = await self._db.execute(
            select(ReconRun).where(ReconRun.id == run_id)
        )
        run = run_result.scalar_one_or_none()
        if run:
            await self._db.execute(
                update(Reconciliation)
                .where(Reconciliation.id == run.reconciliation_id)
                .values(status="completed")
            )

        await self._db.commit()
