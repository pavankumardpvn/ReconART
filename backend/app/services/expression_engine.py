"""Safe expression evaluator for calculated columns.

Uses Python's ast module to parse expressions and evaluate them against
row data. Only whitelisted AST node types and function calls are allowed
— raw eval() is never used.
"""

from __future__ import annotations

import ast
import math
import operator
import re
from datetime import datetime, date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any


# ---------------------------------------------------------------------------
# Whitelisted binary / comparison / unary operators
# ---------------------------------------------------------------------------
_BIN_OPS: dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}

_CMP_OPS: dict[type, Any] = {
    ast.Gt: operator.gt,
    ast.Lt: operator.lt,
    ast.GtE: operator.ge,
    ast.LtE: operator.le,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}

_UNARY_OPS: dict[type, Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
    ast.Not: operator.not_,
}

# ---------------------------------------------------------------------------
# Whitelisted function names (case-insensitive)
# ---------------------------------------------------------------------------
_ALLOWED_FUNCTIONS = {
    # Math
    "abs", "round", "sum", "min", "max", "avg", "average",
    "floor", "ceil", "ceiling", "sqrt", "power", "pow", "mod",
    "log", "log10", "exp",
    # String
    "concat", "upper", "lower", "trim", "substring", "len", "length",
    "left", "right", "mid", "replace", "substitute", "find", "search",
    "proper", "clean", "rept", "exact", "split", "text",
    "startswith", "endswith", "contains", "padleft", "padright",
    # Date
    "today", "now", "year", "month", "day", "hour", "minute", "second",
    "datevalue", "datedif", "dateadd", "weekday",
    # Logical
    "if", "and", "or", "not", "isnull", "isblank", "isnumber", "istext",
    "coalesce", "ifnull", "ifs", "switch",
    # Type conversion
    "value", "int", "float", "str",
}


class ExpressionError(Exception):
    """Raised when an expression cannot be parsed or evaluated safely."""


# ---------------------------------------------------------------------------
# AST validator — walks the tree and rejects disallowed nodes
# ---------------------------------------------------------------------------
_SAFE_NODE_TYPES = (
    ast.Expression,
    ast.Module,
    ast.Expr,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.Call,
    ast.Name,
    ast.Constant,
    ast.Load,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.Pow,
    ast.FloorDiv,
    ast.UAdd,
    ast.USub,
    ast.Not,
    ast.Gt,
    ast.Lt,
    ast.GtE,
    ast.LtE,
    ast.Eq,
    ast.NotEq,
    ast.BoolOp,
    ast.And,
    ast.Or,
    ast.IfExp,
)


def _validate_ast(node: ast.AST) -> None:
    """Recursively validate that every node in the AST is safe."""
    if not isinstance(node, _SAFE_NODE_TYPES):
        raise ExpressionError(
            f"Disallowed expression element: {type(node).__name__}"
        )

    # Validate function calls — only whitelisted names
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            if node.func.id.lower() not in _ALLOWED_FUNCTIONS:
                raise ExpressionError(
                    f"Function not allowed: {node.func.id}"
                )
        else:
            raise ExpressionError("Only simple function calls are allowed")

    for child in ast.iter_child_nodes(node):
        _validate_ast(child)


# ---------------------------------------------------------------------------
# Safe evaluator — walks the AST and computes the result
# ---------------------------------------------------------------------------

def _coerce_numeric(value: Any) -> float | int:
    """Try to coerce a value to a number for arithmetic."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    try:
        s = str(value).strip()
        if "." in s:
            return float(s)
        return int(s)
    except (ValueError, TypeError, InvalidOperation):
        raise ExpressionError(f"Cannot convert '{value}' to a number")


def _parse_date(value: Any) -> date:
    s = str(value).strip() if value is not None else ""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s[:len(fmt) + 2], fmt).date()
        except (ValueError, IndexError):
            continue
    raise ExpressionError(f"Cannot parse date: {s}")


def _parse_datetime(value: Any) -> datetime:
    s = str(value).strip() if value is not None else ""
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S IST", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:len(fmt) + 4], fmt)
        except (ValueError, IndexError):
            continue
    raise ExpressionError(f"Cannot parse datetime: {s}")


def _eval_node(node: ast.AST, variables: dict[str, Any]) -> Any:
    """Evaluate a single AST node against the provided variable namespace."""

    if isinstance(node, ast.Expression):
        return _eval_node(node.body, variables)

    if isinstance(node, ast.Constant):
        return node.value

    if isinstance(node, ast.Name):
        name = node.id
        # Check if it's a whitelisted function name being used as a reference
        # (should only happen inside ast.Call, handled there)
        if name in variables:
            return variables[name]
        # Check case-insensitive match
        for key in variables:
            if key.lower() == name.lower():
                return variables[key]
        # Return None for unknown columns instead of raising
        return None

    if isinstance(node, ast.UnaryOp):
        op_func = _UNARY_OPS.get(type(node.op))
        if op_func is None:
            raise ExpressionError(f"Unsupported unary operator: {type(node.op).__name__}")
        operand = _eval_node(node.operand, variables)
        return op_func(_coerce_numeric(operand))

    if isinstance(node, ast.BinOp):
        op_func = _BIN_OPS.get(type(node.op))
        if op_func is None:
            raise ExpressionError(f"Unsupported operator: {type(node.op).__name__}")
        left = _coerce_numeric(_eval_node(node.left, variables))
        right = _coerce_numeric(_eval_node(node.right, variables))
        if isinstance(node.op, ast.Div) and right == 0:
            raise ExpressionError("Division by zero")
        return op_func(left, right)

    if isinstance(node, ast.Compare):
        left = _eval_node(node.left, variables)
        for op, comparator in zip(node.ops, node.comparators):
            right = _eval_node(comparator, variables)
            op_func = _CMP_OPS.get(type(op))
            if op_func is None:
                raise ExpressionError(f"Unsupported comparison: {type(op).__name__}")
            # Try numeric comparison first, fall back to string
            try:
                result = op_func(_coerce_numeric(left), _coerce_numeric(right))
            except ExpressionError:
                result = op_func(str(left or ""), str(right or ""))
            if not result:
                return False
            left = right
        return True

    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            return all(_eval_node(v, variables) for v in node.values)
        elif isinstance(node.op, ast.Or):
            return any(_eval_node(v, variables) for v in node.values)

    if isinstance(node, ast.IfExp):
        # Python ternary: then_val if condition else else_val
        condition = _eval_node(node.test, variables)
        if condition:
            return _eval_node(node.body, variables)
        return _eval_node(node.orelse, variables)

    if isinstance(node, ast.Call):
        func_name = node.func.id.upper()  # type: ignore[union-attr]
        args = [_eval_node(a, variables) for a in node.args]
        n = len(args)
        _s = lambda v: str(v) if v is not None else ""

        # === MATH ===
        if func_name == "ABS":
            return abs(_coerce_numeric(args[0]))
        if func_name == "ROUND":
            digits = int(_coerce_numeric(args[1])) if n >= 2 else 0
            return round(_coerce_numeric(args[0]), digits)
        if func_name == "SUM":
            return sum(_coerce_numeric(a) for a in args)
        if func_name == "MIN":
            return min(_coerce_numeric(a) for a in args)
        if func_name == "MAX":
            return max(_coerce_numeric(a) for a in args)
        if func_name in ("AVG", "AVERAGE"):
            if n == 0:
                return 0
            return sum(_coerce_numeric(a) for a in args) / n
        if func_name == "FLOOR":
            return math.floor(_coerce_numeric(args[0]))
        if func_name in ("CEIL", "CEILING"):
            return math.ceil(_coerce_numeric(args[0]))
        if func_name == "SQRT":
            return math.sqrt(_coerce_numeric(args[0]))
        if func_name in ("POWER", "POW"):
            return math.pow(_coerce_numeric(args[0]), _coerce_numeric(args[1]))
        if func_name == "MOD":
            return _coerce_numeric(args[0]) % _coerce_numeric(args[1])
        if func_name == "LOG":
            val = _coerce_numeric(args[0])
            base = _coerce_numeric(args[1]) if n >= 2 else math.e
            return math.log(val, base)
        if func_name == "LOG10":
            return math.log10(_coerce_numeric(args[0]))
        if func_name == "EXP":
            return math.exp(_coerce_numeric(args[0]))

        # === STRING ===
        if func_name == "CONCAT":
            return "".join(_s(a) for a in args)
        if func_name == "UPPER":
            return _s(args[0]).upper()
        if func_name == "LOWER":
            return _s(args[0]).lower()
        if func_name == "TRIM":
            return _s(args[0]).strip()
        if func_name == "PROPER":
            return _s(args[0]).title()
        if func_name == "CLEAN":
            return re.sub(r"[^\x20-\x7E]", "", _s(args[0]))
        if func_name in ("LEN", "LENGTH"):
            return len(_s(args[0]))
        if func_name == "LEFT":
            count = int(_coerce_numeric(args[1])) if n >= 2 else 1
            return _s(args[0])[:count]
        if func_name == "RIGHT":
            count = int(_coerce_numeric(args[1])) if n >= 2 else 1
            return _s(args[0])[-count:] if count > 0 else ""
        if func_name == "MID":
            s = _s(args[0])
            start = int(_coerce_numeric(args[1]))
            length = int(_coerce_numeric(args[2])) if n >= 3 else len(s)
            return s[start:start + length]
        if func_name == "SUBSTRING":
            s = _s(args[0])
            start = int(_coerce_numeric(args[1]))
            if n >= 3:
                return s[start:start + int(_coerce_numeric(args[2]))]
            return s[start:]
        if func_name == "REPLACE":
            return _s(args[0]).replace(_s(args[1]), _s(args[2]), 1)
        if func_name == "SUBSTITUTE":
            s, old, new = _s(args[0]), _s(args[1]), _s(args[2])
            count = int(_coerce_numeric(args[3])) if n >= 4 else -1
            return s.replace(old, new) if count < 0 else s.replace(old, new, count)
        if func_name == "FIND":
            pos = _s(args[0]).find(_s(args[1]))
            return pos if pos >= 0 else -1
        if func_name == "SEARCH":
            pos = _s(args[0]).lower().find(_s(args[1]).lower())
            return pos if pos >= 0 else -1
        if func_name == "REPT":
            return _s(args[0]) * int(_coerce_numeric(args[1]))
        if func_name == "EXACT":
            return _s(args[0]) == _s(args[1])
        if func_name == "SPLIT":
            parts = _s(args[0]).split(_s(args[1]))
            idx = int(_coerce_numeric(args[2])) if n >= 3 else 0
            return parts[idx] if 0 <= idx < len(parts) else ""
        if func_name == "TEXT":
            val = args[0]
            fmt = _s(args[1]) if n >= 2 else ""
            if fmt and isinstance(val, (int, float)):
                try:
                    return format(val, fmt)
                except (ValueError, TypeError):
                    return str(val)
            return str(val) if val is not None else ""
        if func_name == "STARTSWITH":
            return _s(args[0]).startswith(_s(args[1]))
        if func_name == "ENDSWITH":
            return _s(args[0]).endswith(_s(args[1]))
        if func_name == "CONTAINS":
            return _s(args[1]) in _s(args[0])
        if func_name == "PADLEFT":
            width = int(_coerce_numeric(args[1]))
            char = _s(args[2]) if n >= 3 else "0"
            return _s(args[0]).rjust(width, char[0] if char else "0")
        if func_name == "PADRIGHT":
            width = int(_coerce_numeric(args[1]))
            char = _s(args[2]) if n >= 3 else " "
            return _s(args[0]).ljust(width, char[0] if char else " ")

        # === DATE ===
        if func_name == "TODAY":
            return date.today().isoformat()
        if func_name == "NOW":
            return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if func_name == "DATEVALUE":
            s = _s(args[0])
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
                try:
                    return datetime.strptime(s[:len(fmt) + 2], fmt).date().isoformat()
                except (ValueError, IndexError):
                    continue
            raise ExpressionError(f"Cannot parse date: {s}")
        if func_name == "YEAR":
            return _parse_date(args[0]).year
        if func_name == "MONTH":
            return _parse_date(args[0]).month
        if func_name == "DAY":
            return _parse_date(args[0]).day
        if func_name == "HOUR":
            return _parse_datetime(args[0]).hour
        if func_name == "MINUTE":
            return _parse_datetime(args[0]).minute
        if func_name == "SECOND":
            return _parse_datetime(args[0]).second
        if func_name == "WEEKDAY":
            return _parse_date(args[0]).isoweekday()
        if func_name == "DATEDIF":
            d1 = _parse_date(args[0])
            d2 = _parse_date(args[1])
            unit = _s(args[2]).upper() if n >= 3 else "D"
            delta = abs((d2 - d1).days)
            if unit == "D":
                return delta
            if unit == "M":
                return delta // 30
            if unit == "Y":
                return delta // 365
            return delta
        if func_name == "DATEADD":
            d = _parse_date(args[0])
            amount = int(_coerce_numeric(args[1]))
            unit = _s(args[2]).upper() if n >= 3 else "D"
            if unit == "D":
                return (d + timedelta(days=amount)).isoformat()
            if unit == "M":
                return (d + timedelta(days=amount * 30)).isoformat()
            if unit == "Y":
                return (d + timedelta(days=amount * 365)).isoformat()
            return (d + timedelta(days=amount)).isoformat()

        # === LOGICAL ===
        if func_name == "IF":
            if n != 3:
                raise ExpressionError("IF() takes 3 arguments: IF(condition, then, else)")
            return args[1] if args[0] else args[2]
        if func_name == "AND":
            return all(args)
        if func_name == "OR":
            return any(args)
        if func_name == "NOT":
            return not args[0]
        if func_name in ("ISNULL", "ISBLANK"):
            return args[0] is None or _s(args[0]).strip() == ""
        if func_name == "ISNUMBER":
            try:
                _coerce_numeric(args[0])
                return True
            except ExpressionError:
                return False
        if func_name == "ISTEXT":
            return isinstance(args[0], str)
        if func_name in ("COALESCE", "IFNULL"):
            for a in args:
                if a is not None and _s(a).strip() != "":
                    return a
            return None
        if func_name == "IFS":
            for i in range(0, n - 1, 2):
                if args[i]:
                    return args[i + 1]
            return None
        if func_name == "SWITCH":
            val = args[0]
            for i in range(1, n - 1, 2):
                if val == args[i]:
                    return args[i + 1]
            if n % 2 == 0:
                return args[-1]
            return None

        # === TYPE CONVERSION ===
        if func_name == "VALUE":
            return _coerce_numeric(args[0])
        if func_name == "INT":
            return int(_coerce_numeric(args[0]))
        if func_name == "FLOAT":
            return float(_coerce_numeric(args[0]))
        if func_name == "STR":
            return _s(args[0])

        raise ExpressionError(f"Unknown function: {func_name}")

    raise ExpressionError(f"Unsupported node type: {type(node).__name__}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

FORMULA_REFERENCE = [
    {"category": "Math", "name": "ABS", "syntax": "ABS(number)", "description": "Returns the absolute value", "example": "ABS(amount)"},
    {"category": "Math", "name": "ROUND", "syntax": "ROUND(number, decimals)", "description": "Rounds to specified decimal places", "example": "ROUND(price, 2)"},
    {"category": "Math", "name": "SUM", "syntax": "SUM(a, b, ...)", "description": "Adds all values together", "example": "SUM(debit, credit, fees)"},
    {"category": "Math", "name": "MIN", "syntax": "MIN(a, b, ...)", "description": "Returns the smallest value", "example": "MIN(price1, price2)"},
    {"category": "Math", "name": "MAX", "syntax": "MAX(a, b, ...)", "description": "Returns the largest value", "example": "MAX(bid, ask)"},
    {"category": "Math", "name": "AVERAGE", "syntax": "AVERAGE(a, b, ...)", "description": "Returns the average of values", "example": "AVERAGE(q1, q2, q3, q4)"},
    {"category": "Math", "name": "FLOOR", "syntax": "FLOOR(number)", "description": "Rounds down to nearest integer", "example": "FLOOR(amount)"},
    {"category": "Math", "name": "CEIL", "syntax": "CEIL(number)", "description": "Rounds up to nearest integer", "example": "CEIL(amount)"},
    {"category": "Math", "name": "SQRT", "syntax": "SQRT(number)", "description": "Returns the square root", "example": "SQRT(variance)"},
    {"category": "Math", "name": "POWER", "syntax": "POWER(base, exponent)", "description": "Raises base to a power", "example": "POWER(rate, years)"},
    {"category": "Math", "name": "MOD", "syntax": "MOD(number, divisor)", "description": "Returns the remainder", "example": "MOD(row_num, 2)"},
    {"category": "Math", "name": "LOG", "syntax": "LOG(number, base?)", "description": "Returns logarithm (default: natural)", "example": "LOG(value, 10)"},
    {"category": "Math", "name": "EXP", "syntax": "EXP(number)", "description": "Returns e raised to a power", "example": "EXP(rate)"},
    {"category": "String", "name": "CONCAT", "syntax": "CONCAT(a, b, ...)", "description": "Joins text values together", "example": 'CONCAT(first_name, " ", last_name)'},
    {"category": "String", "name": "UPPER", "syntax": "UPPER(text)", "description": "Converts to uppercase", "example": "UPPER(currency)"},
    {"category": "String", "name": "LOWER", "syntax": "LOWER(text)", "description": "Converts to lowercase", "example": "LOWER(email)"},
    {"category": "String", "name": "PROPER", "syntax": "PROPER(text)", "description": "Capitalizes first letter of each word", "example": "PROPER(name)"},
    {"category": "String", "name": "TRIM", "syntax": "TRIM(text)", "description": "Removes leading/trailing spaces", "example": "TRIM(description)"},
    {"category": "String", "name": "CLEAN", "syntax": "CLEAN(text)", "description": "Removes non-printable characters", "example": "CLEAN(raw_data)"},
    {"category": "String", "name": "LEN", "syntax": "LEN(text)", "description": "Returns the length of text", "example": "LEN(account_number)"},
    {"category": "String", "name": "LEFT", "syntax": "LEFT(text, count)", "description": "Returns first N characters", "example": "LEFT(reference, 4)"},
    {"category": "String", "name": "RIGHT", "syntax": "RIGHT(text, count)", "description": "Returns last N characters", "example": "RIGHT(account, 4)"},
    {"category": "String", "name": "MID", "syntax": "MID(text, start, length)", "description": "Extracts characters from middle", "example": "MID(code, 2, 4)"},
    {"category": "String", "name": "REPLACE", "syntax": "REPLACE(text, old, new)", "description": "Replaces first occurrence", "example": 'REPLACE(status, "pending", "active")'},
    {"category": "String", "name": "SUBSTITUTE", "syntax": "SUBSTITUTE(text, old, new, count?)", "description": "Replaces all (or N) occurrences", "example": 'SUBSTITUTE(path, "/", "-")'},
    {"category": "String", "name": "FIND", "syntax": "FIND(text, search)", "description": "Finds position (case-sensitive, -1 if not found)", "example": 'FIND(description, "error")'},
    {"category": "String", "name": "SEARCH", "syntax": "SEARCH(text, search)", "description": "Finds position (case-insensitive)", "example": 'SEARCH(notes, "urgent")'},
    {"category": "String", "name": "SPLIT", "syntax": "SPLIT(text, delimiter, index?)", "description": "Splits text and returns Nth part", "example": 'SPLIT(full_name, " ", 0)'},
    {"category": "String", "name": "CONTAINS", "syntax": "CONTAINS(text, search)", "description": "Returns true if text contains search", "example": 'CONTAINS(description, "refund")'},
    {"category": "String", "name": "STARTSWITH", "syntax": "STARTSWITH(text, prefix)", "description": "Returns true if text starts with prefix", "example": 'STARTSWITH(account, "AC")'},
    {"category": "String", "name": "ENDSWITH", "syntax": "ENDSWITH(text, suffix)", "description": "Returns true if text ends with suffix", "example": 'ENDSWITH(file, ".csv")'},
    {"category": "String", "name": "PADLEFT", "syntax": "PADLEFT(text, width, char?)", "description": "Pads text on the left (default: 0)", "example": 'PADLEFT(id, 8, "0")'},
    {"category": "String", "name": "REPT", "syntax": "REPT(text, times)", "description": "Repeats text N times", "example": 'REPT("-", 10)'},
    {"category": "String", "name": "TEXT", "syntax": "TEXT(value, format?)", "description": "Formats a number as text", "example": 'TEXT(amount, ",.2f")'},
    {"category": "Date", "name": "TODAY", "syntax": "TODAY()", "description": "Returns today's date", "example": "TODAY()"},
    {"category": "Date", "name": "NOW", "syntax": "NOW()", "description": "Returns current date and time", "example": "NOW()"},
    {"category": "Date", "name": "YEAR", "syntax": "YEAR(date)", "description": "Extracts year from a date", "example": "YEAR(transaction_date)"},
    {"category": "Date", "name": "MONTH", "syntax": "MONTH(date)", "description": "Extracts month (1-12)", "example": "MONTH(created_at)"},
    {"category": "Date", "name": "DAY", "syntax": "DAY(date)", "description": "Extracts day of month (1-31)", "example": "DAY(due_date)"},
    {"category": "Date", "name": "WEEKDAY", "syntax": "WEEKDAY(date)", "description": "Returns day of week (1=Mon, 7=Sun)", "example": "WEEKDAY(payment_date)"},
    {"category": "Date", "name": "DATEVALUE", "syntax": "DATEVALUE(text)", "description": "Parses a date string to date", "example": 'DATEVALUE("2026-01-15")'},
    {"category": "Date", "name": "DATEDIF", "syntax": "DATEDIF(start, end, unit?)", "description": "Difference between dates (D/M/Y)", "example": 'DATEDIF(start_date, end_date, "D")'},
    {"category": "Date", "name": "DATEADD", "syntax": "DATEADD(date, amount, unit?)", "description": "Adds days/months/years to a date", "example": 'DATEADD(due_date, 30, "D")'},
    {"category": "Logical", "name": "IF", "syntax": "IF(condition, then, else)", "description": "Returns then if true, else if false", "example": 'IF(amount > 0, "credit", "debit")'},
    {"category": "Logical", "name": "IFS", "syntax": "IFS(cond1, val1, cond2, val2, ...)", "description": "Multiple conditions, returns first match", "example": 'IFS(score > 90, "A", score > 80, "B", score > 70, "C")'},
    {"category": "Logical", "name": "SWITCH", "syntax": "SWITCH(value, match1, result1, ..., default?)", "description": "Matches value and returns result", "example": 'SWITCH(status, "A", "Active", "I", "Inactive", "Unknown")'},
    {"category": "Logical", "name": "AND", "syntax": "AND(cond1, cond2, ...)", "description": "Returns true if ALL conditions are true", "example": "AND(amount > 0, status == 'active')"},
    {"category": "Logical", "name": "OR", "syntax": "OR(cond1, cond2, ...)", "description": "Returns true if ANY condition is true", "example": "OR(type == 'credit', type == 'refund')"},
    {"category": "Logical", "name": "NOT", "syntax": "NOT(condition)", "description": "Reverses true/false", "example": "NOT(ISBLANK(email))"},
    {"category": "Logical", "name": "ISNULL", "syntax": "ISNULL(value)", "description": "Returns true if value is null or empty", "example": "ISNULL(phone)"},
    {"category": "Logical", "name": "ISNUMBER", "syntax": "ISNUMBER(value)", "description": "Returns true if value is numeric", "example": "ISNUMBER(amount)"},
    {"category": "Logical", "name": "ISTEXT", "syntax": "ISTEXT(value)", "description": "Returns true if value is text", "example": "ISTEXT(name)"},
    {"category": "Logical", "name": "COALESCE", "syntax": "COALESCE(a, b, ...)", "description": "Returns first non-null value", "example": "COALESCE(phone, email, 'N/A')"},
    {"category": "Convert", "name": "VALUE", "syntax": "VALUE(text)", "description": "Converts text to number", "example": 'VALUE("123.45")'},
    {"category": "Convert", "name": "INT", "syntax": "INT(number)", "description": "Converts to integer (truncates)", "example": "INT(price)"},
    {"category": "Convert", "name": "TEXT", "syntax": "TEXT(value)", "description": "Converts any value to text", "example": "TEXT(amount)"},
    {"category": "Operators", "name": "+", "syntax": "a + b", "description": "Addition", "example": "debit + credit"},
    {"category": "Operators", "name": "-", "syntax": "a - b", "description": "Subtraction", "example": "total - discount"},
    {"category": "Operators", "name": "*", "syntax": "a * b", "description": "Multiplication", "example": "quantity * price"},
    {"category": "Operators", "name": "/", "syntax": "a / b", "description": "Division", "example": "total / count"},
    {"category": "Operators", "name": "%", "syntax": "a % b", "description": "Modulo (remainder)", "example": "amount % 100"},
    {"category": "Operators", "name": "**", "syntax": "a ** b", "description": "Power", "example": "rate ** 2"},
]


def validate_expression(expression: str) -> None:
    """Parse and validate an expression without evaluating it.

    Raises ``ExpressionError`` if the expression is invalid or contains
    disallowed constructs.
    """
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Invalid expression syntax: {exc}") from exc
    _validate_ast(tree)


def evaluate_expression(expression: str, row_data: dict[str, Any]) -> Any:
    """Evaluate an expression against a single row of data.

    Args:
        expression: The formula string (e.g. ``"amount * 1.1"``).
        row_data: A dict mapping column names to their values for this row.

    Returns:
        The computed result.

    Raises:
        ExpressionError: If the expression is invalid or evaluation fails.
    """
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Invalid expression syntax: {exc}") from exc

    _validate_ast(tree)

    try:
        return _eval_node(tree, row_data)
    except ExpressionError:
        raise
    except Exception as exc:
        raise ExpressionError(f"Evaluation error: {exc}") from exc
