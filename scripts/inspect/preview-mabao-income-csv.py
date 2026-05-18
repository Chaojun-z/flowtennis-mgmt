#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


WEEKDAY_SET = {"周一", "周二", "周三", "周四", "周五", "周六", "周日", "周天"}


def clean_cell(value: object) -> str:
    return str(value or "").replace("\u3000", " ").strip()


def normalize_headers(headers: list[str]) -> list[str]:
    normalized = []
    empty_index = 1
    for header in headers:
        title = clean_cell(header)
        if title:
            normalized.append(title)
        else:
            normalized.append(f"空列_{12 + empty_index}")
            empty_index += 1
    return normalized


def is_date_text(value: str) -> bool:
    return bool(re.fullmatch(r"\d{1,2}月\d{1,2}日", clean_cell(value)))


def is_weekday_text(value: str) -> bool:
    return clean_cell(value) in WEEKDAY_SET


def format_date(date_text: str, year: int) -> str:
    month, day = re.fullmatch(r"(\d{1,2})月(\d{1,2})日", clean_cell(date_text)).groups()
    return f"{year:04d}-{int(month):02d}-{int(day):02d}"


def money_text(value: str) -> str:
    raw = clean_cell(value).replace(",", "")
    return raw or "0"


def money_value(value: str) -> float:
    try:
        return float(money_text(value))
    except Exception:
        return 0.0


def normalize_minute(text: str) -> str:
    raw = clean_cell(text)
    if raw in {"", ":", "-"}:
        return "00"
    digits = re.sub(r"[^\d]", "", raw)
    if digits == "":
        return "00"
    if digits == "30":
        return "30"
    if len(digits) == 1:
        return f"0{digits}"
    return digits[:2]


def parse_time_part(text: str) -> tuple[int, int]:
    raw = clean_cell(text)
    if not raw:
        raise ValueError("empty time part")
    normalized = raw.replace("：", ":").replace("点半", ":30").replace("点", ":").replace("分", "")
    normalized = normalized.replace("半", "30")
    if ":" in normalized:
        hour_text, minute_text = normalized.split(":", 1)
        hour = int(re.sub(r"[^\d]", "", hour_text) or "0")
        minute = int(normalize_minute(minute_text))
    else:
        hour = int(re.sub(r"[^\d]", "", normalized) or "0")
        minute = 0
    if hour < 0 or hour > 23:
        raise ValueError(f"invalid hour: {hour}")
    if minute < 0 or minute > 59:
        raise ValueError(f"invalid minute: {minute}")
    return hour, minute


def format_time(hour: int, minute: int) -> str:
    return f"{hour:02d}:{minute:02d}"


def normalize_time_range(raw_text: str) -> tuple[str, str]:
    raw = clean_cell(raw_text)
    if not raw:
        return "", "empty_time"
    text = raw.replace("－", "-").replace("—", "-").replace("–", "-").replace("~", "-").replace("～", "-")
    text = text.replace("至", "-").replace("到", "-")
    text = re.sub(r"\s+", "", text)
    if "-" not in text:
      try:
        hour, minute = parse_time_part(text)
        return format_time(hour, minute), "single_point"
      except Exception:
        return raw, "invalid_time"
    start_text, end_text = text.split("-", 1)
    try:
        start_hour, start_minute = parse_time_part(start_text)
        end_hour, end_minute = parse_time_part(end_text)
        if (end_hour, end_minute) <= (start_hour, start_minute):
            return raw, "invalid_range"
        return f"{format_time(start_hour, start_minute)}-{format_time(end_hour, end_minute)}", "ok"
    except Exception:
        return raw, "invalid_time"


def safe_slug(text: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", text.lower()).strip("-") or "preview"


@dataclass
class PreviewRow:
    source_row_no: int
    business_date: str
    weekday: str
    time_range: str
    time_status: str
    customer: str
    income_type: str
    payment_method: str
    receivable_amount: float
    actual_amount: float
    diff_amount: float
    collector: str
    note: str
    row_status: str
    issue: str


def build_preview_rows(input_path: Path, year: int) -> list[PreviewRow]:
    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        rows = list(reader)
    if not rows:
        return []
    headers = normalize_headers(rows[0])
    preview_rows: list[PreviewRow] = []
    current_date_text = ""
    for row_no, values in enumerate(rows[1:], start=2):
        padded = values + [""] * max(0, len(headers) - len(values))
        record = {headers[index]: clean_cell(padded[index]) for index in range(len(headers))}
        raw_date = record.get("日期", "")
        raw_weekday = record.get("星期", "")
        if is_weekday_text(raw_date) and is_date_text(raw_weekday):
            raw_date, raw_weekday = raw_weekday, raw_date
        if raw_date:
            current_date_text = raw_date
        normalized_date = format_date(current_date_text, year) if is_date_text(current_date_text) else ""
        time_range, time_status = normalize_time_range(record.get("时间", ""))
        income_type = record.get("收入类型", "")
        payment_method = record.get("支付方式", "")
        customer = record.get("客户", "")
        issues: list[str] = []
        row_status = "ready"
        if not normalized_date:
            issues.append("缺少日期")
            row_status = "skip"
        if not income_type:
            issues.append("缺少收入类型")
            row_status = "skip"
        if time_status in {"invalid_time", "invalid_range"}:
            issues.append("时间异常")
            row_status = "review"
        elif time_status == "single_point":
            issues.append("只有单点时间")
            row_status = "review" if row_status == "ready" else row_status
        elif time_status == "empty_time":
            issues.append("缺少时间")
            row_status = "review" if row_status == "ready" else row_status
        if not customer:
            issues.append("缺少客户")
            row_status = "review" if row_status == "ready" else row_status
        preview_rows.append(
            PreviewRow(
                source_row_no=row_no,
                business_date=normalized_date,
                weekday=raw_weekday,
                time_range=time_range,
                time_status=time_status,
                customer=customer,
                income_type=income_type,
                payment_method=payment_method,
                receivable_amount=money_value(record.get("应收收入（元）", "0")),
                actual_amount=money_value(record.get("实际收入（元）", "0")),
                diff_amount=money_value(record.get("差价（元）", "0")),
                collector=record.get("收款人", ""),
                note=record.get("备注", ""),
                row_status=row_status,
                issue="；".join(issues),
            )
        )
    return preview_rows


def write_preview_csv(rows: list[PreviewRow], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "source_row_no",
            "business_date",
            "weekday",
            "time_range",
            "time_status",
            "customer",
            "income_type",
            "payment_method",
            "receivable_amount",
            "actual_amount",
            "diff_amount",
            "collector",
            "note",
            "row_status",
            "issue",
        ])
        for row in rows:
            writer.writerow([
                row.source_row_no,
                row.business_date,
                row.weekday,
                row.time_range,
                row.time_status,
                row.customer,
                row.income_type,
                row.payment_method,
                f"{row.receivable_amount:.2f}",
                f"{row.actual_amount:.2f}",
                f"{row.diff_amount:.2f}",
                row.collector,
                row.note,
                row.row_status,
                row.issue,
            ])


def summarize(rows: list[PreviewRow]) -> dict[str, object]:
    income_types = sorted({row.income_type for row in rows if row.income_type})
    payment_methods = sorted({row.payment_method for row in rows if row.payment_method})
    status_counts: dict[str, int] = {}
    time_counts: dict[str, int] = {}
    for row in rows:
        status_counts[row.row_status] = status_counts.get(row.row_status, 0) + 1
        time_counts[row.time_status] = time_counts.get(row.time_status, 0) + 1
    return {
        "total_rows": len(rows),
        "status_counts": status_counts,
        "time_status_counts": time_counts,
        "income_type_count": len(income_types),
        "payment_method_count": len(payment_methods),
        "income_types": income_types,
        "payment_methods": payment_methods,
        "review_rows": [row.source_row_no for row in rows if row.row_status == "review"][:50],
        "skip_rows": [row.source_row_no for row in rows if row.row_status == "skip"][:50],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="预览并清洗马坡收入 CSV")
    parser.add_argument("--input", required=True, help="原始 CSV 路径")
    parser.add_argument("--year", type=int, default=datetime.now().year, help="日期补全年份，默认当前年")
    parser.add_argument("--output-dir", default="docs/reports", help="输出目录，默认 docs/reports")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = Path(__file__).resolve().parents[1] / output_dir

    rows = build_preview_rows(input_path, args.year)
    base_name = safe_slug(input_path.stem)
    preview_csv_path = output_dir / f"{base_name}-preview.csv"
    summary_json_path = output_dir / f"{base_name}-summary.json"
    write_preview_csv(rows, preview_csv_path)
    summary = summarize(rows)
    summary_json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "input": str(input_path),
        "preview_csv": str(preview_csv_path),
        "summary_json": str(summary_json_path),
        **summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
