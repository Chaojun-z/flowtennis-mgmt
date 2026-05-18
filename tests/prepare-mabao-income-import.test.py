import importlib.util
import json
import sys
from pathlib import Path


script_path = Path(__file__).resolve().parents[1] / "scripts" / "inspect" / "prepare-mabao-income-import.py"
spec = importlib.util.spec_from_file_location("prepare_mabao_income_import", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_build_rows_should_prepare_ready_and_suspend_abnormal_rows(tmp_path: Path):
    csv_path = tmp_path / "sample.csv"
    csv_path.write_text(
        "日期,星期,时间,客户,收入类型,支付方式,应收收入（元）,实际收入（元）,差价（元）,差价说明,收款人,备注\n"
        "1月10日,周六,13-15点,XB,散客纯定场（小程序）,小程序,320,320,0,,小程序,\n"
        ",,15-16点,简先生,私教体验课,微信转账支付,160,160,0,,Mira,\n"
        "周日,2月1日,18点06分,畅打,约球局,微信转账支付,440,440,0,,Mira,\n"
        ",,bad-time,匿名,,微信,100,100,0,,Mira,\n",
        encoding="utf-8-sig",
    )

    rows = module.build_import_rows(csv_path, 2026)
    ready_rows = [row for row in rows if row.classification_status == "auto_ready"]
    suspended_rows = [row for row in rows if row.classification_status == "needs_review"]

    assert len(ready_rows) == 2
    assert ready_rows[0].business_date == "2026-01-10"
    assert ready_rows[0].normalized_time_range == "13:00-15:00"
    assert ready_rows[0].parsed_start_time == "13:00"
    assert ready_rows[0].parsed_end_time == "15:00"
    assert ready_rows[1].business_date == "2026-01-10"
    assert ready_rows[1].normalized_time_range == "15:00-16:00"

    assert len(suspended_rows) == 2
    assert suspended_rows[0].business_date == "2026-02-01"
    assert suspended_rows[0].weekday_text == "周日"
    assert "只有单点时间" in suspended_rows[0].review_reason
    assert "时间范围异常" in suspended_rows[1].review_reason
    assert "缺少收入类型" in suspended_rows[1].review_reason


def test_main_should_write_ready_csv_and_summary_json(tmp_path: Path):
    csv_path = tmp_path / "sample.csv"
    csv_path.write_text(
        "日期,星期,时间,客户,收入类型,支付方式,应收收入（元）,实际收入（元）,差价（元）,差价说明,收款人,备注\n"
        "1月10日,周六,13-15点,XB,散客纯定场（小程序）,小程序,320,320,0,,小程序,\n"
        ",,18点06分,简先生,私教体验课,微信转账支付,160,160,0,,Mira,\n",
        encoding="utf-8-sig",
    )
    output_dir = tmp_path / "reports"

    exit_code = module.main([
        "--input",
        str(csv_path),
        "--year",
        "2026",
        "--output-dir",
        str(output_dir),
    ])

    assert exit_code == 0
    ready_csv = output_dir / "sample-ready.csv"
    summary_json = output_dir / "sample-summary.json"
    assert ready_csv.exists()
    assert summary_json.exists()

    summary = json.loads(summary_json.read_text(encoding="utf-8"))
    assert summary["total_rows"] == 2
    assert summary["ready_rows"] == 1
    assert summary["needs_review_rows"] == 1
    assert summary["ready_row_numbers"] == [2]
    assert summary["needs_review_row_numbers"] == [3]

    ready_text = ready_csv.read_text(encoding="utf-8-sig")
    assert "标准时间段" in ready_text
    assert "13:00-15:00" in ready_text
    assert "18:06" not in ready_text


if __name__ == "__main__":
    test_build_rows_should_prepare_ready_and_suspend_abnormal_rows(Path("/tmp"))
    test_main_should_write_ready_csv_and_summary_json(Path("/tmp"))
    print("prepare mabao income import tests passed")
