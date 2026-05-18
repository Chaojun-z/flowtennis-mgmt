#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


def load_preview_module():
    script_path = Path(__file__).resolve().parent / "preview-mabao-income-csv.py"
    spec = importlib.util.spec_from_file_location("preview_mabao_income_csv_shared", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


preview = load_preview_module()


@dataclass
class ImportRow:
    source_row_number: int
    raw_date_text: str
    business_date: str
    raw_weekday_text: str
    weekday_text: str
    raw_time_text: str
    normalized_time_range: str
    parsed_start_time: str
    parsed_end_time: str
    time_status: str
    raw_customer_name: str
    raw_income_type: str
    raw_payment_method: str
    raw_receivable_amount_text: str
    raw_actual_amount_text: str
    raw_difference_amount_text: str
    raw_difference_reason: str
    raw_collector_name: str
    raw_notes: str
    classification_status: str
    review_reason: str


def split_time_range(normalized_time_range: str, time_status: str) -> tuple[str, str]:
    if time_status != "ok" or "-" not in normalized_time_range:
        return "", ""
    start_text, end_text = normalized_time_range.split("-", 1)
    return start_text, end_text


def build_import_rows(input_path: Path, year: int) -> list[ImportRow]:
    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        rows = list(reader)
    if not rows:
        return []

    headers = preview.normalize_headers(rows[0])
    import_rows: list[ImportRow] = []
    current_date_text = ""

    for row_no, values in enumerate(rows[1:], start=2):
        padded = values + [""] * max(0, len(headers) - len(values))
        record = {headers[index]: preview.clean_cell(padded[index]) for index in range(len(headers))}

        raw_date = record.get("日期", "")
        raw_weekday = record.get("星期", "")
        if preview.is_weekday_text(raw_date) and preview.is_date_text(raw_weekday):
            raw_date, raw_weekday = raw_weekday, raw_date
        if raw_date:
            current_date_text = raw_date

        business_date = preview.format_date(current_date_text, year) if preview.is_date_text(current_date_text) else ""
        normalized_time_range, time_status = preview.normalize_time_range(record.get("时间", ""))
        parsed_start_time, parsed_end_time = split_time_range(normalized_time_range, time_status)

        review_reasons: list[str] = []
        classification_status = "auto_ready"
        if not business_date:
            review_reasons.append("缺少日期")
        if time_status == "invalid_time":
            review_reasons.append("时间异常")
        elif time_status == "invalid_range":
            review_reasons.append("时间范围异常")
        elif time_status == "single_point":
            review_reasons.append("只有单点时间")
        elif time_status == "empty_time":
            review_reasons.append("缺少时间")
        if not record.get("客户", ""):
            review_reasons.append("缺少客户")
        if not record.get("收入类型", ""):
            review_reasons.append("缺少收入类型")
        if review_reasons:
            classification_status = "needs_review"

        import_rows.append(
            ImportRow(
                source_row_number=row_no,
                raw_date_text=record.get("日期", ""),
                business_date=business_date,
                raw_weekday_text=record.get("星期", ""),
                weekday_text=raw_weekday,
                raw_time_text=record.get("时间", ""),
                normalized_time_range=normalized_time_range,
                parsed_start_time=parsed_start_time,
                parsed_end_time=parsed_end_time,
                time_status=time_status,
                raw_customer_name=record.get("客户", ""),
                raw_income_type=record.get("收入类型", ""),
                raw_payment_method=record.get("支付方式", ""),
                raw_receivable_amount_text=preview.money_text(record.get("应收收入（元）", "0")),
                raw_actual_amount_text=preview.money_text(record.get("实际收入（元）", "0")),
                raw_difference_amount_text=preview.money_text(record.get("差价（元）", "0")),
                raw_difference_reason=record.get("差价说明", ""),
                raw_collector_name=record.get("收款人", ""),
                raw_notes=record.get("备注", ""),
                classification_status=classification_status,
                review_reason="；".join(review_reasons),
            )
        )
    return import_rows


def write_ready_csv(rows: list[ImportRow], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "原表行号",
            "日期原文",
            "日期",
            "星期原文",
            "星期",
            "时间原文",
            "标准时间段",
            "开始时间",
            "结束时间",
            "时间状态",
            "客户",
            "收入类型",
            "支付方式",
            "应收收入（元）",
            "实际收入（元）",
            "差价（元）",
            "差价说明",
            "收款人",
            "备注",
            "classificationStatus",
            "reviewReason",
        ])
        for row in rows:
            if row.classification_status != "auto_ready":
                continue
            writer.writerow([
                row.source_row_number,
                row.raw_date_text,
                row.business_date,
                row.raw_weekday_text,
                row.weekday_text,
                row.raw_time_text,
                row.normalized_time_range,
                row.parsed_start_time,
                row.parsed_end_time,
                row.time_status,
                row.raw_customer_name,
                row.raw_income_type,
                row.raw_payment_method,
                row.raw_receivable_amount_text,
                row.raw_actual_amount_text,
                row.raw_difference_amount_text,
                row.raw_difference_reason,
                row.raw_collector_name,
                row.raw_notes,
                row.classification_status,
                row.review_reason,
            ])


def summarize(rows: list[ImportRow]) -> dict[str, object]:
    ready_rows = [row for row in rows if row.classification_status == "auto_ready"]
    review_rows = [row for row in rows if row.classification_status == "needs_review"]
    time_status_counts: dict[str, int] = {}
    for row in rows:
        time_status_counts[row.time_status] = time_status_counts.get(row.time_status, 0) + 1
    return {
        "total_rows": len(rows),
        "ready_rows": len(ready_rows),
        "needs_review_rows": len(review_rows),
        "ready_row_numbers": [row.source_row_number for row in ready_rows],
        "needs_review_row_numbers": [row.source_row_number for row in review_rows],
        "time_status_counts": time_status_counts,
        "needs_review_details": [
            {
                "source_row_number": row.source_row_number,
                "business_date": row.business_date,
                "customer": row.raw_customer_name,
                "income_type": row.raw_income_type,
                "time_text": row.raw_time_text,
                "review_reason": row.review_reason,
            }
            for row in review_rows
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="马坡原始 CSV 正式导入前置脚本")
    parser.add_argument("--input", required=True, help="原始 CSV 路径")
    parser.add_argument("--year", type=int, default=datetime.now().year, help="日期补全年份，默认当前年")
    parser.add_argument("--output-dir", default="docs/reports", help="输出目录，默认 docs/reports")
    args = parser.parse_args(argv)

    input_path = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = Path(__file__).resolve().parents[1] / output_dir

    rows = build_import_rows(input_path, args.year)
    base_name = preview.safe_slug(input_path.stem)
    ready_csv_path = output_dir / f"{base_name}-ready.csv"
    summary_json_path = output_dir / f"{base_name}-summary.json"

    write_ready_csv(rows, ready_csv_path)
    summary = summarize(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "input": str(input_path),
        "ready_csv": str(ready_csv_path),
        "summary_json": str(summary_json_path),
        **summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
