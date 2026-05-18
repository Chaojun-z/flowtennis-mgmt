#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
from pathlib import Path


READY_COLUMNS = [
    "原表行号",
    "日期时间",
    "客户",
    "收入类型",
    "支付方式",
    "应收",
    "实收",
    "备注",
    "你的回答",
    "补充备注",
    "parseType",
    "businessType",
    "campusId",
    "campusName",
    "accountingScope",
    "paymentChannel",
    "recognizeRevenue",
    "cashDelta",
    "recognizedRevenueDelta",
    "deferredRevenueDelta",
    "studentName",
    "packageName",
    "lessonCount",
    "couponAmount",
    "wechatTopupAmount",
    "note",
]

BLOCKED_COLUMNS = [
    "原表行号",
    "日期时间",
    "客户",
    "收入类型",
    "支付方式",
    "应收",
    "实收",
    "备注",
    "status",
    "parseType",
    "note",
]


def load_build_module():
    script_path = Path(__file__).resolve().parent / "build-confirmed-income-batch.py"
    spec = importlib.util.spec_from_file_location("build_confirmed_income_batch_shared", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


build = load_build_module()


def money(value: object) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except Exception:
        return 0.0


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, object]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})


def base_confirmed_row(source_row: dict[str, str]) -> dict[str, object]:
    return {
        "原表行号": source_row.get("原表行号", ""),
        "日期时间": source_row.get("日期", ""),
        "客户": source_row.get("客户", ""),
        "收入类型": source_row.get("收入类型", ""),
        "支付方式": source_row.get("支付方式", ""),
        "应收": source_row.get("应收收入（元）", ""),
        "实收": source_row.get("实际收入（元）", ""),
        "备注": source_row.get("备注", ""),
        "你的回答": "",
        "补充备注": "",
    }


def ready_result(source_row: dict[str, str], **kwargs: object) -> dict[str, object]:
    row = base_confirmed_row(source_row)
    row.update(
        {
            "parseType": "",
            "businessType": "",
            "campusId": "mabao",
            "campusName": "顺义马坡",
            "accountingScope": "mabao_only",
            "paymentChannel": "",
            "recognizeRevenue": "",
            "cashDelta": "",
            "recognizedRevenueDelta": "",
            "deferredRevenueDelta": "",
            "studentName": "",
            "packageName": "",
            "lessonCount": "",
            "couponAmount": "",
            "wechatTopupAmount": "",
            "note": "",
        }
    )
    row.update(kwargs)
    return row


def blocked_result(source_row: dict[str, str], note: str, parse_type: str = "") -> dict[str, object]:
    row = base_confirmed_row(source_row)
    row.update(
        {
            "status": "pending",
            "parseType": parse_type,
            "note": note,
        }
    )
    return row


def is_booking_income_type(income_type: str) -> bool:
    tokens = ["定场", "约球局"]
    return any(token in income_type for token in tokens)


def is_course_income_type(income_type: str) -> bool:
    tokens = ["私教", "专项", "小班", "课程"]
    return any(token in income_type for token in tokens)


def map_payment_channel(raw_payment: str) -> str:
    if "小程序" in raw_payment:
        return "小程序"
    if "微信" in raw_payment:
        return "微信"
    return raw_payment or "沿用原表"


def classify_source_row(source_row: dict[str, str]) -> dict[str, object]:
    bridged = base_confirmed_row(source_row)
    existing = build.classify(bridged)
    if existing.get("status") == "ready" and existing.get("parseType"):
        bridged.update(existing)
        return bridged

    classification_status = source_row.get("classificationStatus", "")
    if classification_status and classification_status != "auto_ready":
        return blocked_result(source_row, source_row.get("reviewReason", "原表未通过预校验"))

    income_type = str(source_row.get("收入类型", "") or "").strip()
    payment = str(source_row.get("支付方式", "") or "").strip()
    customer = str(source_row.get("客户", "") or "").strip()
    note = str(source_row.get("备注", "") or "").strip()
    due = money(source_row.get("应收收入（元）", "0"))
    paid = money(source_row.get("实际收入（元）", "0"))

    if "课包划扣" in payment:
        return blocked_result(source_row, "课包划扣缺少学生名/课包名，桥接脚本不安全自动导入", "package_consume")

    if "储值卡" in payment:
        return blocked_result(source_row, "储值卡属于递延收入扣减，现有桥接脚本不安全自动导入", "stored_value_consume")

    if "大众点评" in payment and "微信" in payment:
        return blocked_result(source_row, "大众点评+微信混合支付缺少拆分金额，桥接脚本不安全自动导入", "dp_coupon")

    if income_type == "内部使用":
        return ready_result(
            source_row,
            parseType="internal_use",
            businessType="内部占用",
            paymentChannel="无",
            recognizeRevenue="否",
            cashDelta=0,
            recognizedRevenueDelta=0,
            deferredRevenueDelta=0,
            note=note or "按原表内部使用导入",
        )

    if due == 0 and paid == 0 and any(token in f"{customer}{note}" for token in ["内部训练", "教学会议", "教研会议", "清洗场地", "修缮"]):
        return ready_result(
            source_row,
            parseType="internal_use",
            businessType="内部占用",
            paymentChannel="无",
            recognizeRevenue="否",
            cashDelta=0,
            recognizedRevenueDelta=0,
            deferredRevenueDelta=0,
            note=note or "按原表0元占场导入",
        )

    if "大众点评" in payment and paid > 0 and due == paid:
        return ready_result(
            source_row,
            parseType="dp_coupon",
            businessType="大众点评券",
            paymentChannel="大众点评",
            recognizeRevenue="是",
            cashDelta=paid,
            recognizedRevenueDelta=paid,
            deferredRevenueDelta=0,
            couponAmount=paid,
            wechatTopupAmount=0,
            note="按原表大众点评全额支付导入",
        )

    if is_booking_income_type(income_type) and paid > 0 and due == paid and ("小程序" in payment or "微信" in payment):
        return ready_result(
            source_row,
            parseType="booking_income",
            businessType="订场收入",
            paymentChannel=map_payment_channel(payment),
            recognizeRevenue="是",
            cashDelta=paid,
            recognizedRevenueDelta=paid,
            deferredRevenueDelta=0,
            note="按原表订场收入导入",
        )

    if is_booking_income_type(income_type) and paid == 0 and due > 0 and "领导订场" in income_type:
        return ready_result(
            source_row,
            parseType="free_gift",
            businessType="免费赠送",
            paymentChannel="无",
            recognizeRevenue="否",
            cashDelta=0,
            recognizedRevenueDelta=0,
            deferredRevenueDelta=0,
            note="按原表领导订场免费赠送导入",
        )

    if is_course_income_type(income_type) and paid > 0 and due == paid and "微信" in payment:
        return ready_result(
            source_row,
            parseType="course_income",
            businessType="课程收入",
            paymentChannel="微信",
            recognizeRevenue="是",
            cashDelta=paid,
            recognizedRevenueDelta=paid,
            deferredRevenueDelta=0,
            note="按原表课程收入导入",
        )

    if is_course_income_type(income_type) and paid == 0 and due > 0 and not payment:
        return ready_result(
            source_row,
            parseType="free_course",
            businessType="免费课",
            paymentChannel="无",
            recognizeRevenue="否",
            cashDelta=0,
            recognizedRevenueDelta=0,
            deferredRevenueDelta=0,
            note="按原表免费课导入",
        )

    return blocked_result(source_row, "没有命中安全桥接规则，需人工补充后再走正式导入")


def summarize(ready_rows: list[dict[str, object]], blocked_rows: list[dict[str, object]]) -> dict[str, object]:
    parse_type_counts: dict[str, int] = {}
    blocked_reason_counts: dict[str, int] = {}
    for row in ready_rows:
        parse_type = str(row.get("parseType", "") or "")
        parse_type_counts[parse_type] = parse_type_counts.get(parse_type, 0) + 1
    for row in blocked_rows:
        note = str(row.get("note", "") or "")
        blocked_reason_counts[note] = blocked_reason_counts.get(note, 0) + 1
    return {
        "total_rows": len(ready_rows) + len(blocked_rows),
        "ready_rows": len(ready_rows),
        "blocked_rows": len(blocked_rows),
        "ready_row_numbers": [int(str(row["原表行号"])) for row in ready_rows if str(row.get("原表行号", "")).isdigit()],
        "blocked_row_numbers": [int(str(row["原表行号"])) for row in blocked_rows if str(row.get("原表行号", "")).isdigit()],
        "parse_type_counts": parse_type_counts,
        "blocked_reason_counts": blocked_reason_counts,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="把 1-ready.csv 桥接成现有 scripts/import/import-confirmed-income-batch.js 可吃的 ready csv。")
    parser.add_argument("--input", required=True, help="prepare-mabao-income-import 产出的 *-ready.csv")
    parser.add_argument("--output-dir", default="docs/reports", help="输出目录，默认 docs/reports")
    parser.add_argument("--base-name", default="", help="输出文件名前缀，默认取输入文件名")
    args = parser.parse_args(argv)

    input_path = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser()
    if not output_dir.is_absolute():
        output_dir = Path(__file__).resolve().parents[1] / output_dir

    source_rows = load_csv(input_path)
    bridged_rows = [classify_source_row(row) for row in source_rows]
    ready_rows = [row for row in bridged_rows if row.get("status") != "pending"]
    blocked_rows = [row for row in bridged_rows if row.get("status") == "pending"]

    base_name = args.base_name.strip() or input_path.stem
    ready_csv_path = output_dir / f"{base_name}-ready.csv"
    blocked_csv_path = output_dir / f"{base_name}-blocked.csv"
    summary_json_path = output_dir / f"{base_name}-summary.json"

    write_csv(ready_csv_path, ready_rows, READY_COLUMNS)
    write_csv(blocked_csv_path, blocked_rows, BLOCKED_COLUMNS)

    summary = summarize(ready_rows, blocked_rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "input": str(input_path),
        "ready_csv": str(ready_csv_path),
        "blocked_csv": str(blocked_csv_path),
        "summary_json": str(summary_json_path),
        **summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
