#!/usr/bin/env python3
import ast
import json
import sys
from dataclasses import asdict, dataclass, field
from typing import Dict, List


@dataclass
class FunctionNode:
    name: str
    qualname: str
    line: int
    isAsync: bool
    decorators: List[str] = field(default_factory=list)
    calls: List[str] = field(default_factory=list)


@dataclass
class ClassNode:
    name: str
    qualname: str
    line: int
    bases: List[str] = field(default_factory=list)
    decorators: List[str] = field(default_factory=list)


@dataclass
class FileAst:
    imports: List[str] = field(default_factory=list)
    functions: List[FunctionNode] = field(default_factory=list)
    classes: List[ClassNode] = field(default_factory=list)


def expr_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        left = expr_name(node.value)
        if left:
            return f"{left}.{node.attr}"
        return node.attr
    if isinstance(node, ast.Call):
        return expr_name(node.func)
    if isinstance(node, ast.Subscript):
        return expr_name(node.value)
    if isinstance(node, ast.Constant):
        return str(node.value)
    return ""


def extract_calls(node: ast.AST) -> List[str]:
    calls: List[str] = []
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            called = expr_name(sub.func)
            if called:
                calls.append(called)
    seen = set()
    unique_calls: List[str] = []
    for call in calls:
        if call not in seen:
            unique_calls.append(call)
            seen.add(call)
    return unique_calls


class FileVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.imports: List[str] = []
        self.functions: List[FunctionNode] = []
        self.classes: List[ClassNode] = []
        self.scope: List[str] = []

    def push(self, name: str) -> None:
        self.scope.append(name)

    def pop(self) -> None:
        if self.scope:
            self.scope.pop()

    def qualname(self, name: str) -> str:
        if not self.scope:
            return name
        return ".".join([*self.scope, name])

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.imports.append(alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            self.imports.append(node.module)
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        class_qualname = self.qualname(node.name)
        bases = [expr_name(base) for base in node.bases if expr_name(base)]
        decorators = [expr_name(d) for d in node.decorator_list if expr_name(d)]
        self.classes.append(
            ClassNode(
                name=node.name,
                qualname=class_qualname,
                line=node.lineno,
                bases=bases,
                decorators=decorators,
            )
        )
        self.push(node.name)
        self.generic_visit(node)
        self.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._capture_function(node, False)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._capture_function(node, True)

    def _capture_function(self, node: ast.AST, is_async: bool) -> None:
        assert isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        function_qualname = self.qualname(node.name)
        decorators = [expr_name(d) for d in node.decorator_list if expr_name(d)]
        calls = extract_calls(node)
        self.functions.append(
            FunctionNode(
                name=node.name,
                qualname=function_qualname,
                line=node.lineno,
                isAsync=is_async,
                decorators=decorators,
                calls=calls,
            )
        )
        self.push(node.name)
        self.generic_visit(node)
        self.pop()


def parse_file(file_path: str) -> FileAst:
    try:
        with open(file_path, "r", encoding="utf-8") as handle:
            source = handle.read()
        tree = ast.parse(source, filename=file_path)
        visitor = FileVisitor()
        visitor.visit(tree)
        return FileAst(
            imports=sorted(set(visitor.imports)),
            functions=visitor.functions,
            classes=visitor.classes,
        )
    except Exception:
        return FileAst()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        files = payload.get("files", [])
        parsed: Dict[str, Dict] = {}
        for file_path in files:
            parsed[file_path] = asdict(parse_file(file_path))
        print(json.dumps({"ok": True, "files": parsed}))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        sys.exit(0)


if __name__ == "__main__":
    main()
