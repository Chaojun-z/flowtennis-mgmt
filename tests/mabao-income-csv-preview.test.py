import importlib.util
import sys
from pathlib import Path


script_path = Path(__file__).resolve().parents[1] / "scripts" / "inspect" / "preview-mabao-income-csv.py"
spec = importlib.util.spec_from_file_location("preview_mabao_income_csv", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_normalize_time_range_should_expand_basic_hour_range():
    assert module.normalize_time_range("13-15点") == ("13:00-15:00", "ok")


def test_normalize_time_range_should_expand_half_hour_range():
    assert module.normalize_time_range("7点-8点半") == ("07:00-08:30", "ok")


def test_normalize_time_range_should_mark_single_point():
    assert module.normalize_time_range("18点06分") == ("18:06", "single_point")


def test_build_preview_rows_should_inherit_date_and_fix_swapped_weekday(tmp_path: Path):
    csv_path = tmp_path / "sample.csv"
    csv_path.write_text(
        "日期,星期,时间,客户,收入类型,支付方式,应收收入（元）,实际收入（元）,差价（元）,差价说明,收款人,备注\n"
        "1月10日,周六,13-15点,XB,散客纯定场（小程序）,小程序,320,320,0,,小程序,\n"
        ",,15-16点,简先生,私教体验课,微信转账支付,160,160,0,,Mira,\n"
        "周日,2月1日,7点-8点半,畅打,约球局,微信转账支付,440,440,0,,Mira,\n",
        encoding="utf-8-sig",
    )
    rows = module.build_preview_rows(csv_path, 2026)
    assert rows[0].business_date == "2026-01-10"
    assert rows[1].business_date == "2026-01-10"
    assert rows[1].time_range == "15:00-16:00"
    assert rows[2].business_date == "2026-02-01"
    assert rows[2].weekday == "周日"


if __name__ == "__main__":
    test_normalize_time_range_should_expand_basic_hour_range()
    test_normalize_time_range_should_expand_half_hour_range()
    test_normalize_time_range_should_mark_single_point()
    test_build_preview_rows_should_inherit_date_and_fix_swapped_weekday(Path("/tmp"))
    print("mabao income csv preview tests passed")
