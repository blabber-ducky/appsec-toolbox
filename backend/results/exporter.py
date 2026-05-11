from __future__ import annotations
import csv
import io

from results.models import Finding, ColumnMeta


def to_csv(findings: list[Finding], columns: list[ColumnMeta]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[c.key for c in columns],
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()
    for f in findings:
        d = f.to_dict()
        row: dict[str, str] = {}
        for col in columns:
            val = d.get(col.key, "")
            if isinstance(val, list):
                val = "; ".join(str(v) for v in val if v)
            row[col.key] = "" if val is None else str(val)
        writer.writerow(row)
    return output.getvalue()
