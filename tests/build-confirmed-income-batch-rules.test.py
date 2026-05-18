import importlib.util
from pathlib import Path


script_path = Path(__file__).resolve().parents[1] / "scripts" / "inspect" / "build-confirmed-income-batch.py"
spec = importlib.util.spec_from_file_location("build_confirmed_income_batch", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def test_line_100_should_be_ready_booking_income_with_free_note():
    row = {
        "原表行号": "100",
        "客户": "那少大个夏天",
        "支付方式": "微信转账支付",
        "应收": "440.00",
        "实收": "220.00",
        "你的回答": "收费220+免费赠送220",
        "补充备注": "",
    }
    result = module.classify(row)
    assert result["status"] == "ready"
    assert result["parseType"] == "booking_income"
    assert result["cashDelta"] == 220
    assert "免费赠送 220" in result["note"]


def test_line_516_should_be_trace_only_and_not_count_into_mabao():
    row = {
        "原表行号": "516",
        "客户": "陈川",
        "支付方式": "课包划扣",
        "应收": "0.00",
        "实收": "0.00",
        "你的回答": "陈川、60课时课包、扣2课时，需要扣十里堡的，马坡收入+0",
        "补充备注": "",
    }
    result = module.classify(row)
    assert result["status"] == "ready"
    assert result["parseType"] == "cross_campus_consume_trace"
    assert result["recognizedRevenueDelta"] == 0
    assert result["cashDelta"] == 0


def test_line_540_should_consume_two_lessons_for_1200():
    row = {
        "原表行号": "540",
        "客户": "oliver",
        "支付方式": "课包划扣",
        "应收": "1200.00",
        "实收": "1200.00",
        "你的回答": "课包划扣2课时 共1200（1课时600）",
        "补充备注": "",
    }
    result = module.classify(row)
    assert result["status"] == "ready"
    assert result["parseType"] == "package_consume"
    assert result["recognizedRevenueDelta"] == 1200
    assert result["lessonCount"] == 2


def test_line_776_should_keep_cash_topup_and_package_consume_together():
    row = {
        "原表行号": "776",
        "客户": "测试学员",
        "支付方式": "课包划扣",
        "应收": "380.00",
        "实收": "80.00",
        "你的回答": "课包扣1次，另收80微信",
        "补充备注": "",
    }
    result = module.classify(row)
    assert result["status"] == "ready"
    assert result["parseType"] == "package_consume"
    assert result["cashDelta"] == 80
    assert result["recognizedRevenueDelta"] == 380
    assert result["deferredRevenueDelta"] == -300


def test_winter_camp_should_use_fixed_daily_amount_280():
    row = {
        "原表行号": "1035",
        "客户": "冬训营 王德蔚",
        "支付方式": "训练营",
        "应收": "0.00",
        "实收": "0.00",
        "你的回答": "王德蔚/青少年训练营10课时课包，扣2课时\n桃子/青少年训练营10课时课包，扣2课时",
        "补充备注": "",
    }
    result = module.classify(row)
    assert result["status"] == "ready"
    assert result["parseType"] == "camp_income"
    assert result["cashDelta"] == 280
    assert result["recognizedRevenueDelta"] == 280


def test_line_1168_should_match_yaya_package_consume():
    row = {
        "原表行号": "1168",
        "客户": "siren 丫丫 私教课",
        "支付方式": "课包划扣",
        "应收": "480.00",
        "实收": "480.00",
        "你的回答": "丫丫/1v1  10课时非黄金时间课包，扣一课时",
        "补充备注": "需要和丹丹姐确认是否收到",
    }
    result = module.classify(row)
    assert result["status"] == "ready"
    assert result["studentName"] == "丫丫"
    assert result["lessonCount"] == 1
    assert result["recognizedRevenueDelta"] == 480


if __name__ == "__main__":
    test_line_100_should_be_ready_booking_income_with_free_note()
    test_line_516_should_be_trace_only_and_not_count_into_mabao()
    test_line_540_should_consume_two_lessons_for_1200()
    test_line_776_should_keep_cash_topup_and_package_consume_together()
    test_winter_camp_should_use_fixed_daily_amount_280()
    test_line_1168_should_match_yaya_package_consume()
    print("build confirmed income batch rule tests passed")
