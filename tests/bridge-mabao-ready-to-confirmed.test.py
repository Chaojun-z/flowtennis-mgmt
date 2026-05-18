import csv
import importlib.util
import json
import sys
from pathlib import Path


script_path = Path(__file__).resolve().parents[1] / "scripts" / "inspect" / "bridge-mabao-ready-to-confirmed.py"
spec = importlib.util.spec_from_file_location("bridge_mabao_ready_to_confirmed", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def test_bridge_should_split_safe_ready_rows_and_blocked_rows(tmp_path: Path):
    input_path = tmp_path / "source-ready.csv"
    input_path.write_text(
        "原表行号,日期原文,日期,星期原文,星期,时间原文,标准时间段,开始时间,结束时间,时间状态,客户,收入类型,支付方式,应收收入（元）,实际收入（元）,差价（元）,差价说明,收款人,备注,classificationStatus,reviewReason\n"
        "2,1月10日,2026-01-10,周六,周六,7-9点,07:00-09:00,07:00,09:00,ok,XB,散客纯定场（小程序）,小程序,320,320,0,,小程序,,auto_ready,\n"
        "3,,2026-01-10,,,9-10点,09:00-10:00,09:00,10:00,ok,小萌,私教正式课,微信转账支付,440,440,0,,Roger,,auto_ready,\n"
        "4,,2026-01-10,,,10-11点,10:00-11:00,10:00,11:00,ok,佑佑,私教正式课,课包划扣,500,500,0,,Roger,,auto_ready,\n"
        "5,,2026-01-10,,,11-12点,11:00-12:00,11:00,12:00,ok,静,散客纯定场（小程序）,8折储值卡,224,224,0,,Roger,,auto_ready,\n"
        "6,,2026-01-10,,,12-14点,12:00-14:00,12:00,14:00,ok,内部训练,内部使用,,0,0,0,,,内部训练,auto_ready,\n",
        encoding="utf-8-sig",
    )
    output_dir = tmp_path / "reports"

    exit_code = module.main([
        "--input",
        str(input_path),
        "--output-dir",
        str(output_dir),
        "--base-name",
        "bridge-sample",
    ])

    assert exit_code == 0

    ready_rows = read_csv(output_dir / "bridge-sample-ready.csv")
    blocked_rows = read_csv(output_dir / "bridge-sample-blocked.csv")
    summary = json.loads((output_dir / "bridge-sample-summary.json").read_text(encoding="utf-8"))

    assert [row["原表行号"] for row in ready_rows] == ["2", "3", "6"]
    assert ready_rows[0]["parseType"] == "booking_income"
    assert ready_rows[0]["paymentChannel"] == "小程序"
    assert ready_rows[1]["parseType"] == "course_income"
    assert ready_rows[1]["cashDelta"] == "440.0"
    assert ready_rows[2]["parseType"] == "internal_use"

    blocked_by_line = {row["原表行号"]: row for row in blocked_rows}
    assert blocked_by_line["4"]["status"] == "pending"
    assert "课包划扣" in blocked_by_line["4"]["note"]
    assert blocked_by_line["5"]["status"] == "pending"
    assert "储值卡" in blocked_by_line["5"]["note"]

    assert summary["total_rows"] == 5
    assert summary["ready_rows"] == 3
    assert summary["blocked_rows"] == 2
    assert summary["blocked_row_numbers"] == [4, 5]


if __name__ == "__main__":
    test_bridge_should_split_safe_ready_rows_and_blocked_rows(Path("/tmp"))
    print("bridge mabao ready to confirmed tests passed")
