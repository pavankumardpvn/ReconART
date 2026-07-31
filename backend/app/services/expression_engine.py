"""Safe expression evaluator for calculated columns.

Uses Python's ast module to parse expressions and evaluate them against
row data. Only whitelisted AST node types and function calls are allowed
— raw eval() is never used.

Supported operations:
  - Arithmetic: +, -, *, /, %
  - Comparison: >, <, >=, <=, ==, !=
  - String functions: CONCAT(...), UPPER(x), LOWER(x), TRIM(x), SUBSTRING(x, start, length)
  - Conditional: IF(condition, then_value, else_value)
  - Column references: column names used as variable identifiers
"""

from __future__ import annotations

import ast
import operator
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
}

# ---------------------------------------------------------------------------
# Whitelisted function names (case-insensitive)
# ---------------------------------------------------------------------------
_ALLOWED_FUNCTIONS = {"concat", "upper", "lower", "trim", "substring", "if", "abs", "round", "len"}


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
    ast.UAdd,
    ast.USub,
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

        if func_name == "CONCAT":
            return "".join(str(a) if a is not None else "" for a in args)

        if func_name == "UPPER":
            if len(args) != 1:
                raise ExpressionError("UPPER() takes exactly 1 argument")
            return str(args[0]).upper() if args[0] is not None else ""

        if func_name == "LOWER":
            if len(args) != 1:
                raise ExpressionError("LOWER() takes exactly 1 argument")
            return str(args[0]).lower() if args[0] is not None else ""

        if func_name == "TRIM":
            if len(args) != 1:
                raise ExpressionError("TRIM() takes exactly 1 argument")
            return str(args[0]).strip() if args[0] is not None else ""

        if func_name == "SUBSTRING":
            if len(args) not in (2, 3):
                raise ExpressionError("SUBSTRING() takes 2 or 3 arguments")
            s = str(args[0]) if args[0] is not None else ""
            start = int(_coerce_numeric(args[1]))
            if len(args) == 3:
                length = int(_coerce_numeric(args[2]))
                return s[start : start + length]
            return s[start:]

        if func_name == "IF":
            if len(args) != 3:
                raise ExpressionError("IF() takes exactly 3 arguments")
            return args[1] if args[0] else args[2]

        if func_name == "ABS":
            if len(args) != 1:
                raise ExpressionError("ABS() takes exactly 1 argument")
            return abs(_coerce_numeric(args[0]))

        if func_name == "ROUND":
            if len(args) not in (1, 2):
                raise ExpressionError("ROUND() takes 1 or 2 arguments")
            val = _coerce_numeric(args[0])
            digits = int(_coerce_numeric(args[1])) if len(args) == 2 else 0
            return round(val, digits)

        if func_name == "LEN":
            if len(args) != 1:
                raise ExpressionError("LEN() takes exactly 1 argument")
            return len(str(args[0]) if args[0] is not None else "")

        raise ExpressionError(f"Unknown function: {func_name}")

    raise ExpressionError(f"Unsupported node type: {type(node).__name__}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

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
