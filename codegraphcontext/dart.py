# dart.py
from pathlib import Path
from typing import Any, Dict, Optional

from tree_sitter import Query, QueryCursor, QueryError

from codegraphcontext.utils.debug_log import (
    debug_log,
    info_logger,
    error_logger,
    warning_logger,
    debug_logger,
)

# Tree-sitter query patterns for Dart.
# These patterns focus on the node types exported by tree-sitter-language-pack>=0.7.
DART_QUERIES = {
    # ---- Functions (signatures exported by modern grammar)
    "functions": r"""
        (function_signature
            name: (identifier) @name
            (formal_parameter_list)? @params
        ) @function_node

        (getter_signature
            name: (identifier) @name
        ) @function_node

        (setter_signature
            name: (identifier) @name
            (formal_parameter_list)? @params
        ) @function_node

        (constructor_signature
            name: (identifier) @name
            (formal_parameter_list)? @params
        ) @function_node
    """,
    # ---- Classes / Mixins / Enums / Extensions
    "classes": r"""
        (class_definition
            name: (identifier) @name
        ) @class

        (mixin_declaration
            (identifier) @name
        ) @class

        (enum_declaration
            name: (identifier) @name
        ) @class

        (extension_declaration
            name: (identifier)? @name
        ) @class
    """,
    # ---- Imports / Exports / Parts
    "imports": r"""
        (import_or_export
            (library_import
                (import_specification
                    (configurable_uri
                        (uri
                            (string_literal) @path
                        )
                    )
                )
            )
        )

        (import_or_export
            (library_export
                (configurable_uri
                    (uri
                        (string_literal) @path
                    )
                )
            )
        )

        (part_directive
            (uri (string_literal) @path)
        )

        (part_of_directive
            (uri (string_literal) @path)
        )
    """,
    # ---- Calls and variables are populated via manual traversal for now
    "calls": None,
    "variables": None,
    # ---- Comments (for crude docstring extraction)
    "comments": r"""
        (comment) @comment
    """,
}


def is_dart_file(file_path: Path) -> bool:
    return file_path.suffix == ".dart"


class DartTreeSitterParser:
    """
    Dart/Flutter parser using tree-sitter.

    It returns a structure consistent with other CodeGraphContext language modules:
    {
      "file_path": str,
      "functions": [...],
      "classes": [...],
      "variables": [...],
      "imports": [...],
      "function_calls": [...],
      "is_dependency": bool,
      "lang": "dart",
    }
    """

    def __init__(self, generic_parser_wrapper: Any):
        self.generic_parser_wrapper = generic_parser_wrapper
        self.language_name = "dart"
        self.language = generic_parser_wrapper.language
        self.parser = generic_parser_wrapper.parser

        # Compile all queries once, tolerating grammar mismatches gracefully
        self.queries: Dict[str, Optional[Query]] = {}
        for name, query_str in DART_QUERIES.items():
            if not query_str:
                self.queries[name] = None
                continue
            try:
                self.queries[name] = Query(self.language, query_str)
            except QueryError as exc:  # pragma: no cover - defensive for grammar drift
                warning_logger(
                    f"Failed to compile Dart query '{name}': {exc}. "
                    "Falling back to empty results."
                )
                self.queries[name] = None

    # ---------- helpers

    def _text(self, node: Any) -> str:
        return node.text.decode("utf-8")

    def _calc_complexity(self, node: Any) -> int:
        """
        Lightweight cyclomatic complexity approximation for Dart.
        """
        complexity_nodes = {
            # control flow
            "if_statement",
            "for_statement",
            "while_statement",
            "do_statement",
            "switch_statement",
            "case_clause",
            "default_clause",
            "conditional_expression",
            # logical operators commonly appear as separate nodes
            "logical_or_expression",
            "logical_and_expression",
            "binary_expression",  # catch || and && in some grammars
            # exceptions
            "try_statement",
            "catch_clause",
        }
        count = 1

        def walk(n):
            nonlocal count
            if n.type in complexity_nodes:
                count += 1
            for c in n.children:
                walk(c)

        walk(node)
        return count

    def _leading_line_comment(self, node: Any) -> Optional[str]:
        """
        Very simple docstring via leading line/block comment just before node.
        """
        prev = node.prev_sibling
        # Allow whitespace and comments; stop on other node types
        while prev and (
            prev.type in ("\n", " ", "metadata") or "comment" in prev.type
        ):
            if "comment" in prev.type:
                return self._text(prev).strip()
            prev = prev.prev_sibling
        return None

    def _extract_function_name(self, node: Any) -> Optional[str]:
        if node is None:
            return None
        if node.type in ("function_signature", "getter_signature", "setter_signature"):
            nm = node.child_by_field_name("name")
            if nm:
                return self._text(nm)
        if node.type == "constructor_signature":
            parts: list[str] = []
            for child in node.children:
                if child.type == "identifier":
                    parts.append(self._text(child))
                elif child.type == ".":
                    parts.append(".")
                else:
                    break
            if parts:
                return "".join(parts)
        return None

    def _captures(self, query_name: str, node: Any) -> list[tuple[Any, str]]:
        query = self.queries.get(query_name)
        if query is None:
            return []
        cursor = QueryCursor(query)
        captures = cursor.captures(node)
        results: list[tuple[Any, str]] = []
        for capture_name, nodes in captures.items():
            for captured_node in nodes:
                results.append((captured_node, capture_name))
        results.sort(key=lambda item: item[0].start_byte)
        return results

    # ---------- public API

    def parse(self, file_path: Path, is_dependency: bool = False) -> Dict[str, Any]:
        try:
            source_code = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            warning_logger(f"Failed to read {file_path}: {e}")
            return {
                "file_path": str(file_path),
                "functions": [],
                "classes": [],
                "variables": [],
                "imports": [],
                "function_calls": [],
                "is_dependency": is_dependency,
                "lang": self.language_name,
            }

        tree = self.parser.parse(bytes(source_code, "utf8"))
        root = tree.root_node

        return {
            "file_path": str(file_path),
            "functions": self._find_functions(root),
            "classes": self._find_classes(root),
            "variables": self._find_variables(root),
            "imports": self._find_imports(root),
            "function_calls": self._find_calls(root),
            "is_dependency": is_dependency,
            "lang": self.language_name,
        }

    # ---------- finders

    def _find_functions(self, root) -> list[Dict[str, Any]]:
        out = []
        captures = self._captures("functions", root)
        if not captures:
            return out

        # We’ll bucket captures by the function node they belong to.
        buckets: dict[tuple[int, int], Dict[str, Any]] = {}

        signature_types = {
            "function_signature",
            "getter_signature",
            "setter_signature",
            "constructor_signature",
        }

        def find_signature(node: Any) -> Optional[Any]:
            cur = node
            while cur:
                if cur.type in signature_types:
                    return cur
                cur = cur.parent
            return None

        def bucket(sig: Any) -> Dict[str, Any]:
            key = (sig.start_byte, sig.end_byte)
            entry = buckets.setdefault(
                key, {"signature": sig, "name": None, "params": None}
            )
            # Prefer the earliest signature node we encounter (tree-sitter may materialize
            # distinct wrapper objects for the same span).
            if entry.get("signature") is None:
                entry["signature"] = sig
            return entry

        def node_for_params(pnode: Any) -> Optional[Any]:
            # Walk upward until we hit the method/function container
            return find_signature(pnode)

        for node, cap in captures:
            if cap == "function_node":
                sig = find_signature(node)
                if sig is not None:
                    bucket(sig)
            elif cap == "name":
                sig = find_signature(node)
                if sig is not None:
                    b = bucket(sig)
                    b["name"] = self._text(node)
            elif cap == "params":
                fn = node_for_params(node)
                if fn:
                    b = bucket(fn)
                    b["params"] = node

        for info in buckets.values():
            fn_node = info["signature"]
            name = info["name"]
            derived_name = self._extract_function_name(fn_node)
            if not name:
                name = derived_name
            elif fn_node.type == "constructor_signature" and derived_name:
                # Prefer full constructor names such as `Foo.named`
                name = derived_name
            if not name:
                continue

            # Extract parameter names (best-effort)
            params = []
            p = info.get("params")
            if p:
                for child in p.children:
                    if child.type == "formal_parameter_list":
                        for ch in child.children:
                            if ch.type == "normal_formal_parameter":
                                idn = ch.child_by_field_name("name")
                                if idn:
                                    params.append(self._text(idn))
                            elif ch.type == "simple_formal_parameter":
                                idn = ch.child_by_field_name("name")
                                if idn:
                                    params.append(self._text(idn))
                    elif child.type == "simple_formal_parameter":
                        idn = child.child_by_field_name("name")
                        if idn:
                            params.append(self._text(idn))

            # Locate an enclosing node that represents the whole declaration, so we can pick up
            # comments and the function body for span calculations.
            container = fn_node
            parent = fn_node.parent
            if parent and parent.type in (
                "method_signature",
                "setter_signature",
                "getter_signature",
                "constructor_signature",
                "declaration",
            ):
                container = parent

            body_node = None
            # Methods have their bodies as the next sibling of the container, top-level functions
            # keep it next to the signature node.
            for candidate in (container.next_named_sibling, fn_node.next_named_sibling):
                if candidate and candidate.type == "function_body":
                    body_node = candidate
                    break

            end_node = body_node or container

            doc = self._leading_line_comment(fn_node)
            if doc is None and container is not fn_node:
                doc = self._leading_line_comment(container)

            source_segments = [self._text(fn_node)]
            if body_node is not None:
                source_segments.append(self._text(body_node))
            source_text = "\n".join(
                segment for segment in source_segments if segment.strip()
            )

            out.append(
                {
                    "name": name,
                    "line_number": container.start_point[0] + 1,
                    "end_line": end_node.end_point[0] + 1,
                    "args": params,
                    "source": source_text,
                    "source_code": source_text,
                    "docstring": doc,
                    "cyclomatic_complexity": self._calc_complexity(end_node),
                    "context": None,
                    "context_type": None,
                    "class_context": None,
                    "decorators": [],
                    "lang": self.language_name,
                    "is_dependency": False,
                }
            )
        return out

    def _find_classes(self, root) -> list[Dict[str, Any]]:
        out = []
        for node, cap in self._captures("classes", root):
            if cap == "class":
                name_node = node.child_by_field_name("name")
                if not name_node:
                    # Handle grammars where the identifier is a positional child (e.g. mixins)
                    for child in node.children:
                        if child.type == "identifier":
                            name_node = child
                            break
                if not name_node:
                    # Some extensions may omit a name (extension on Type)
                    name_text = "extension"
                else:
                    name_text = self._text(name_node)

                out.append(
                    {
                        "name": name_text,
                        "line_number": node.start_point[0] + 1,
                        "end_line": node.end_point[0] + 1,
                        "bases": [],  # Dart uses 'extends', 'implements', 'with'—can be added later if needed
                        "source": self._text(node),
                        "docstring": self._leading_line_comment(node),
                        "context": None,
                        "decorators": [],
                        "lang": self.language_name,
                        "is_dependency": False,
                    }
                )
        return out

    def _find_imports(self, root) -> list[Dict[str, Any]]:
        out = []
        for node, cap in self._captures("imports", root):
            if cap != "path":
                continue
            # The parent is the directive node; capture line number from it.
            parent = node.parent if node.parent is not None else node
            raw = self._text(node).strip("\"'")
            out.append(
                {
                    "name": raw,  # e.g., package:flutter/material.dart
                    "full_import_name": raw,
                    "line_number": parent.start_point[0] + 1,
                    "alias": None,  # could parse 'as alias' later
                    "lang": self.language_name,
                    "is_dependency": False,
                }
            )
        return out

    def _find_calls(self, root) -> list[Dict[str, Any]]:
        out = []
        for node, cap in self._captures("calls", root):
            if cap == "name":
                out.append(
                    {
                        "name": self._text(node),
                        "full_name": self._text(node.parent)
                        if node.parent
                        else self._text(node),
                        "line_number": node.start_point[0] + 1,
                        "args": [],
                        "inferred_obj_type": None,
                        "context": None,
                        "class_context": None,
                        "lang": self.language_name,
                        "is_dependency": False,
                    }
                )
        return out

    def _find_variables(self, root) -> list[Dict[str, Any]]:
        out = []
        captures = self._captures("variables", root)
        if not captures:
            return out

        # Group by the declaration node so we can attach value/line neatly
        buckets: dict[int, Dict[str, Any]] = {}

        def bucket(n: Any) -> Dict[str, Any]:
            k = id(n)
            if k not in buckets:
                buckets[k] = {"node": n, "name": None, "value": None}
            return buckets[k]

        for node, cap in captures:
            if cap == "name":
                # climb to the nearest variable declaration
                cur = node
                while cur and cur.type not in (
                    "initialized_variable_declaration",
                    "variable_declaration",
                    "top_level_variable_declaration",
                ):
                    cur = cur.parent
                if cur:
                    b = bucket(cur)
                    b["name"] = self._text(node)
            elif cap == "value":
                cur = node
                while cur and cur.type not in (
                    "initialized_variable_declaration",
                    "variable_declaration",
                    "top_level_variable_declaration",
                ):
                    cur = cur.parent
                if cur:
                    b = bucket(cur)
                    b["value"] = self._text(node)

        for info in buckets.values():
            nm = info["name"]
            if not nm:
                continue
            decl_node = info["node"]
            out.append(
                {
                    "name": nm,
                    "line_number": decl_node.start_point[0] + 1,
                    "value": info.get("value"),
                    "type": None,
                    "context": None,
                    "class_context": None,
                    "lang": self.language_name,
                    "is_dependency": False,
                }
            )
        return out


def pre_scan_dart(files: list[Path], parser_wrapper) -> dict:
    """
    Pre-scan Dart files to map discovered symbols (class/enum/mixin/extension/function names)
    to their file paths. This accelerates cross-linking before full parsing.
    """
    imports_map: dict[str, list[str]] = {}

    query_str = r"""
        (class_definition
            name: (identifier) @name
        )

        (mixin_declaration
            (identifier) @name
        )

        (enum_declaration
            name: (identifier) @name
        )

        (extension_declaration
            name: (identifier)? @name
        )

        (function_signature
            name: (identifier) @name
        )

        (getter_signature
            name: (identifier) @name
        )

        (setter_signature
            name: (identifier) @name
        )

        (constructor_signature
            name: (identifier) @name
        )
    """
    try:
        query = Query(parser_wrapper.language, query_str)
    except QueryError as e:
        warning_logger(f"Failed to compile Dart pre-scan query: {e}")
        return imports_map

    for file_path in files:
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            tree = parser_wrapper.parser.parse(bytes(text, "utf8"))
            cursor = QueryCursor(query)
            captures = cursor.captures(tree.root_node)
            for cap_name, nodes in captures.items():
                if cap_name != "name":
                    continue
                for node in nodes:
                    sym = node.text.decode("utf-8")
                    imports_map.setdefault(sym, [])
                    fullpath = str(file_path.resolve())
                    if fullpath not in imports_map[sym]:
                        imports_map[sym].append(fullpath)
        except Exception as e:
            warning_logger(f"Tree-sitter pre-scan failed for {file_path}: {e}")

    return imports_map
